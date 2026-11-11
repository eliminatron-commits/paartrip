// Der Abgleich auf dem Gerät, geprüft mit echter IndexedDB-Logik (fake-indexeddb) und einem kleinen
// Server, der dieselben Regeln aus shared/ anwendet wie der Worker.
import { IDBFactory } from 'fake-indexeddb';
import { beforeEach, describe, expect, it } from 'vitest';
import generated from '../../generated/content-rules.json';
import type { SyncRequest, SyncResponse } from '../../shared/api.ts';
import type { RulesContent } from '../../shared/content-schema.ts';
import { LIMITS } from '../../shared/limits.ts';
import type { HouseState, Slot } from '../../shared/model.ts';
import { applyAction, createHouse, joinHouse } from '../../shared/rules.ts';
import { deriveView } from '../../shared/view.ts';
import { syncSchema } from '../../shared/wire.ts';
import { ApiFailure, type Transport } from './api.ts';
import { DeviceFileError } from './device-file.ts';
import { openStore } from './store.ts';
import { type Snapshot, SyncEngine } from './sync-engine.ts';

const content = generated as unknown as RulesContent;
const NOW = '2026-11-11T10:00:00.000Z';
const CODE = 'ABCD2345';

/** Server im Kleinen: ein Haus, dieselben Regeln, dazu Schalter für Netzausfall und verlorene Antworten. */
class FakeServer {
  state: HouseState | null = null;
  tokens = new Map<string, Slot>();
  seen = new Set<string>();
  online = true;
  /** Die nächste Abgleich-Anfrage wird angewendet, aber ihre Antwort kommt nicht an. */
  loseNextResponse = false;
  /** Wird aufgerufen, während eine Abgleich-Anfrage unterwegs ist. */
  duringSync: (() => void) | null = null;
  syncRequests: SyncRequest[] = [];

  private view(slot: Slot) {
    return deriveView(this.state!, slot, { content, now: NOW, pairingCode: CODE });
  }

  private enter(slot: Slot) {
    const token = `token-${slot}-${'x'.repeat(24)}`;
    this.tokens.set(token, slot);
    return { token, view: this.view(slot) };
  }

  transport(): Pick<Transport, 'createHouse' | 'joinHouse' | 'sync'> {
    const reach = () => {
      if (!this.online) throw new ApiFailure('offline', 'No connection.');
    };
    return {
      createHouse: async ({ name }) => {
        reach();
        this.state = createHouse('house-1', name, { content, now: NOW });
        return this.enter('a');
      },
      joinHouse: async ({ code, name }) => {
        reach();
        if (!this.state || code !== CODE) throw new ApiFailure('invalid_code', 'No house with this code.');
        const next = joinHouse(this.state, name, { content, now: NOW });
        if (!next) throw new ApiFailure('house_full', 'This house already has two people.');
        this.state = next;
        return this.enter('b');
      },
      sync: async (token, body): Promise<SyncResponse> => {
        reach();
        const slot = this.tokens.get(token);
        if (!slot || !this.state) throw new ApiFailure('unauthorized', 'This device is not linked to a house.');
        // Wie der Worker: Was nicht dem Schema entspricht, wird als Ganzes abgewiesen.
        if (!syncSchema.safeParse(body).success) throw new ApiFailure('bad_request', 'Request does not match the expected shape.');
        this.syncRequests.push(structuredClone(body));
        const results = body.actions.map((action) => {
          if (this.seen.has(action.id)) return { id: action.id, outcome: 'duplicate' as const };
          this.seen.add(action.id);
          const applied = applyAction(this.state!, slot, action, { content, now: NOW });
          this.state = applied.state;
          return applied.result;
        });
        this.duringSync?.();
        if (this.loseNextResponse) {
          this.loseNextResponse = false;
          throw new ApiFailure('offline', 'No connection.');
        }
        return { view: this.view(slot), results };
      },
    };
  }

  secretTexts(): string[] {
    return (this.state?.coupons ?? []).flatMap((c) => (c.kind === 'secret' ? [c.text] : []));
  }
}

let server: FakeServer;
let idb: IDBFactory;
let ids = 0;

beforeEach(() => {
  server = new FakeServer();
  idb = new IDBFactory();
  ids = 0;
});

/** Ein Gerät: eigener Speicher (Name der Datenbank), eigener Abgleich. Derselbe Name = dasselbe Gerät nach Neustart. */
async function device(name: string) {
  const snapshots: Snapshot[] = [];
  const store = await openStore(name, idb);
  const engine = new SyncEngine(store, server.transport(), (s) => snapshots.push(s), {
    now: () => new Date(NOW),
    id: () => `action-${name}-${String(++ids).padStart(4, '0')}`,
  });
  await engine.load();
  return { engine, store, snapshots, get last() { return snapshots.at(-1)!; } };
}

async function pairedDevices() {
  const a = await device('phone-a');
  await a.engine.createHouse('Ada');
  const b = await device('phone-b');
  await b.engine.joinHouse(CODE, 'Bao');
  await a.engine.sync();
  return { a, b };
}

describe('Koppeln und lokale Kopie', () => {
  it('ein frisches Gerät ist ungekoppelt und fragt den Server nicht', async () => {
    const a = await device('phone-a');
    await a.engine.sync();
    expect(a.last).toMatchObject({ status: 'unpaired', view: null, pending: 0 });
    expect(server.syncRequests).toHaveLength(0);
  });

  it('nach dem Anlegen ist das Gerät gekoppelt, und der Stand übersteht einen Neustart ohne Netz', async () => {
    const a = await device('phone-a');
    await a.engine.createHouse('Ada');
    expect(a.last).toMatchObject({ status: 'paired', view: { you: 'a', pairingCode: CODE } });

    server.online = false;
    const restarted = await device('phone-a');
    expect(restarted.last).toMatchObject({ status: 'paired', view: { you: 'a', players: { a: { name: 'Ada' } } } });
    await restarted.engine.sync();
    expect(restarted.last).toMatchObject({ status: 'paired', offline: true, view: { you: 'a' } });
  });

  it('ein abgelehnter Beitritt lässt das Gerät ungekoppelt', async () => {
    const { a } = await pairedDevices();
    expect(a.last.view?.players.b?.name).toBe('Bao');
    const c = await device('phone-c');
    await expect(c.engine.joinHouse(CODE, 'Cleo')).rejects.toMatchObject({ code: 'house_full' });
    await expect(c.engine.joinHouse('WRONG234', 'Cleo')).rejects.toMatchObject({ code: 'invalid_code' });
    expect(c.last.status).toBe('unpaired');
    expect((await c.store.load()).device).toBeNull();
  });
});

describe('Aktionen und Warteschlange', () => {
  it('eine Aktion von A erscheint bei B nach dessen Abgleich – die Sicht kommt immer vom Server', async () => {
    const { a, b } = await pairedDevices();
    await a.engine.dispatch({ type: 'coupon.deposit', text: 'A walk at sunrise' });
    expect(a.last.pending).toBe(0);
    expect(a.last.view?.coupons.some((c) => c.text === 'A walk at sunrise')).toBe(true);

    // B weiß davon erst nach dem eigenen Abgleich – und erfährt den Text nicht.
    expect(b.last.view?.coupons.filter((c) => c.kind === 'secret')).toHaveLength(0);
    await b.engine.sync();
    expect(b.last.view?.coupons.filter((c) => c.kind === 'secret')).toEqual([expect.objectContaining({ from: 'a', state: 'veiled', text: null })]);
  });

  it('offline bleibt die Aktion gesichert in der Warteschlange und wird später nachgereicht – auch nach einem Neustart', async () => {
    const { a } = await pairedDevices();
    const viewBefore = a.last.view;
    server.online = false;
    await a.engine.dispatch({ type: 'coupon.deposit', text: 'Made offline' });

    expect(a.last).toMatchObject({ pending: 1, offline: true });
    // Kein vorauseilendes Umschreiben: Die Sicht bleibt, wie der Server sie zuletzt geschickt hat.
    expect(a.last.view).toEqual(viewBefore);
    expect((await a.store.load()).queue.map((x) => x.type)).toEqual(['coupon.deposit']);
    expect(server.secretTexts()).toEqual([]);

    // Die App wird beendet und später mit Netz wieder geöffnet.
    server.online = true;
    const restarted = await device('phone-a');
    expect(restarted.last.pending).toBe(1);
    await restarted.engine.sync();
    expect(restarted.last).toMatchObject({ pending: 0, offline: false });
    expect(server.secretTexts()).toEqual(['Made offline']);
    expect((await restarted.store.load()).queue).toEqual([]);
  });

  it('geht die Antwort verloren, wird dieselbe Aktion erneut gesendet und nur einmal angewendet', async () => {
    const { a } = await pairedDevices();
    server.loseNextResponse = true;
    await a.engine.dispatch({ type: 'coupon.deposit', text: 'Only once' });
    expect(a.last).toMatchObject({ pending: 1, offline: true });
    expect(server.secretTexts()).toEqual(['Only once']);

    await a.engine.sync();
    expect(a.last).toMatchObject({ pending: 0, offline: false });
    expect(server.secretTexts()).toEqual(['Only once']);
    const sentIds = server.syncRequests.flatMap((r) => r.actions.map((x) => x.id));
    expect(sentIds).toHaveLength(2);
    expect(new Set(sentIds).size).toBe(1);
  });

  it('eine abgelehnte Aktion verlässt die Warteschlange und wird gemeldet', async () => {
    const a = await device('phone-a');
    await a.engine.createHouse('Ada');
    // Allein im Haus lehnt der Server jede Aktion ab.
    await a.engine.dispatch({ type: 'coupon.deposit', text: 'Too early' });
    expect(a.last).toMatchObject({ pending: 0, rejected: 1 });
    expect((await a.store.load()).queue).toEqual([]);
    a.engine.dismissRejected();
    expect(a.last.rejected).toBe(0);
  });

  it('eine lange Warteschlange geht in Teilen und in der ursprünglichen Reihenfolge raus', async () => {
    const { a } = await pairedDevices();
    const count = LIMITS.actionsPerSync + 10;
    server.online = false;
    for (let i = 0; i < count; i++) await a.engine.dispatch({ type: 'coupon.deposit', text: `gift ${i}` });
    expect(a.last.pending).toBe(count);

    server.online = true;
    server.syncRequests = [];
    await a.engine.sync();
    expect(a.last.pending).toBe(0);
    expect(server.syncRequests.every((r) => r.actions.length <= LIMITS.actionsPerSync)).toBe(true);
    expect(server.secretTexts()).toEqual(Array.from({ length: count }, (_, i) => `gift ${i}`));
  });

  it('eine Aktion, die der Server als fehlerhaft abweist, hält die anderen nicht auf', async () => {
    const { a } = await pairedDevices();
    server.online = false;
    await a.engine.dispatch({ type: 'coupon.deposit', text: 'first' });
    // Länger, als der Server annimmt – etwa nach einem Update mit strengeren Regeln.
    await a.engine.dispatch({ type: 'coupon.deposit', text: 'x'.repeat(LIMITS.couponTextLength + 1) });
    await a.engine.dispatch({ type: 'coupon.deposit', text: 'third' });

    server.online = true;
    await a.engine.sync();
    expect(a.last).toMatchObject({ pending: 0, rejected: 1, error: null });
    expect(server.secretTexts()).toEqual(['first', 'third']);
    expect((await a.store.load()).queue).toEqual([]);
  });

  it('eine Aktion, die während eines laufenden Abgleichs entsteht, geht direkt im Anschluss raus', async () => {
    const { a } = await pairedDevices();
    let second: Promise<void> | null = null;
    server.duringSync = () => {
      server.duringSync = null;
      second = a.engine.dispatch({ type: 'coupon.deposit', text: 'second' });
    };
    await a.engine.dispatch({ type: 'coupon.deposit', text: 'first' });
    await second;
    expect(a.last).toMatchObject({ pending: 0, syncing: false });
    expect(server.secretTexts()).toEqual(['first', 'second']);
  });

  it('kennt der Server das Gerät nicht mehr, wird das gemeldet und nichts verworfen', async () => {
    const { a } = await pairedDevices();
    server.tokens.clear();
    await a.engine.dispatch({ type: 'coupon.deposit', text: 'kept' });
    expect(a.last).toMatchObject({ status: 'paired', error: 'unauthorized', pending: 1, offline: false });
    expect((await a.store.load()).queue).toHaveLength(1);
  });
});

describe('Export und Import des Gerätestands', () => {
  it('ein leeres Gerät übernimmt Rolle, Stand und wartende Aktionen', async () => {
    const { a } = await pairedDevices();
    server.online = false;
    await a.engine.dispatch({ type: 'coupon.deposit', text: 'travels along' });
    const file = JSON.stringify(await a.engine.exportDevice());
    expect(file).toContain(a.engine.token);

    // Neues Telefon, leerer Speicher.
    server.online = true;
    const fresh = await device('new-phone');
    expect(fresh.last.status).toBe('unpaired');
    await fresh.engine.importDevice(file);

    expect(fresh.last).toMatchObject({ status: 'paired', pending: 0, view: { you: 'a', houseId: 'house-1', players: { a: { name: 'Ada' }, b: { name: 'Bao' } } } });
    expect(fresh.engine.token).toBe(a.engine.token);
    expect(server.secretTexts()).toEqual(['travels along']);

    // … und bleibt es nach einem Neustart.
    const restarted = await device('new-phone');
    expect(restarted.last).toMatchObject({ status: 'paired', view: { you: 'a' } });
  });

  it('eine fremde oder beschädigte Datei wird abgelehnt und ändert nichts', async () => {
    const { a, b } = await pairedDevices();
    const good = await b.engine.exportDevice();
    const bad = [
      'not json',
      '{}',
      JSON.stringify({ ...good, format: 'something-else' }),
      JSON.stringify({ ...good, device: { ...good.device, token: '' } }),
      JSON.stringify({ ...good, view: { ...good.view, you: 'a' } }),
      JSON.stringify({ ...good, queue: [{ type: 'house.burn' }] }),
    ];
    for (const text of bad) await expect(a.engine.importDevice(text), text.slice(0, 40)).rejects.toBeInstanceOf(DeviceFileError);
    expect(a.last).toMatchObject({ status: 'paired', view: { you: 'a' } });
    expect((await a.store.load()).device?.slot).toBe('a');
  });

  it('ohne Haus gibt es nichts zu exportieren', async () => {
    const a = await device('phone-a');
    await expect(a.engine.exportDevice()).rejects.toBeInstanceOf(DeviceFileError);
  });
});
