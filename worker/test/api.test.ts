// Tests gegen den lokal gestarteten Worker (echtes workerd, echte D1): Koppeln, Abgleich, Geheimhaltung, CORS.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import generated from '../../generated/content-rules.json';
import type { ApiError, EnterHouseResponse } from '../../shared/api.ts';
import type { RulesContent } from '../../shared/content-schema.ts';
import type { HouseState } from '../../shared/model.ts';
import { action, call, noon, ORIGIN, pair, playTasks, sync } from './client.ts';
import { type LocalApi, startLocalApi } from './local-api.ts';

let api: LocalApi;

beforeAll(async () => {
  api = await startLocalApi({ origin: ORIGIN });
});
afterAll(async () => {
  await api.close();
});

async function readState(houseId: string): Promise<HouseState> {
  const row = await (await api.db()).prepare('SELECT state FROM houses WHERE id = ?').bind(houseId).first<{ state: string }>();
  return JSON.parse(row?.state ?? 'null') as HouseState;
}

const chapter = (generated as unknown as RulesContent).chapters[0]!;
/** Erster Spieltag der gestellten Uhr. */
const START = '2027-01-11';

describe('Koppeln', () => {
  it('A legt ein Haus an und bekommt Token, Rolle a und einen Kopplungscode', async () => {
    const reply = await call<EnterHouseResponse>(api, 'POST', '/houses', { body: { name: '  Ada ' } });
    expect(reply.status).toBe(201);
    expect(reply.json.token.length).toBeGreaterThanOrEqual(40);
    expect(reply.json.view).toMatchObject({ you: 'a', players: { a: { name: 'Ada' }, b: null } });
    expect(reply.json.view.pairingCode).toMatch(/^[2-9A-HJ-NP-Z]{8}$/);
  });

  it('B tritt mit dem Code bei – auch klein geschrieben und mit Bindestrich – und bekommt Rolle b', async () => {
    const a = await call<EnterHouseResponse>(api, 'POST', '/houses', { body: { name: 'Ada' } });
    const code = a.json.view.pairingCode ?? '';
    const typed = `${code.slice(0, 4)}-${code.slice(4)}`.toLowerCase();

    const b = await call<EnterHouseResponse>(api, 'POST', '/houses/join', { body: { code: typed, name: 'Bao' } });
    expect(b.status).toBe(201);
    expect(b.json.view).toMatchObject({ you: 'b', houseId: a.json.view.houseId, players: { a: { name: 'Ada' }, b: { name: 'Bao' } } });
    expect(b.json.token).not.toBe(a.json.token);

    // Sobald das Haus voll ist, steht der Code in keiner Sicht mehr.
    expect(b.json.view.pairingCode).toBeNull();
    const again = await sync(api, a.json.token);
    expect(again.json.view.pairingCode).toBeNull();
    expect(again.json.view.players.b?.name).toBe('Bao');
  });

  it('ein dritter Beitritt wird abgelehnt', async () => {
    const { a, code } = await pair(api);
    const third = await call<ApiError>(api, 'POST', '/houses/join', { body: { code, name: 'Cleo' } });
    expect(third.status).toBe(409);
    expect(third.json.error).toBe('house_full');

    const devices = await (await api.db()).prepare('SELECT slot FROM devices WHERE house_id = ? ORDER BY slot').bind(a.view.houseId).all<{ slot: string }>();
    expect(devices.results.map((d) => d.slot)).toEqual(['a', 'b']);
    expect((await readState(a.view.houseId)).players.b?.name).toBe('Bao');
  });

  it('von zwei gleichzeitigen Beitritten gewinnt genau einer', async () => {
    const a = await call<EnterHouseResponse>(api, 'POST', '/houses', { body: { name: 'Ada' } });
    const code = a.json.view.pairingCode ?? '';
    const replies = await Promise.all(['Bao', 'Cleo'].map((name) => call<EnterHouseResponse & ApiError>(api, 'POST', '/houses/join', { body: { code, name } })));
    expect(replies.map((r) => r.status).sort()).toEqual([201, 409]);
    const winner = replies.find((r) => r.status === 201);
    expect((await readState(a.json.view.houseId)).players.b?.name).toBe(winner?.json.view.players.b?.name);
  });

  it('ein unbekannter Code wird abgelehnt', async () => {
    for (const code of ['ZZZZ-ZZZZ', 'abc', '']) {
      const reply = await call<ApiError>(api, 'POST', '/houses/join', { body: { code, name: 'Bao' } });
      expect(reply.status, code).toBe(404);
      expect(reply.json.error).toBe('invalid_code');
    }
  });

  it('ohne oder mit falschem Token gibt es keinen Stand', async () => {
    await pair(api);
    for (const token of [undefined, 'not-a-real-token']) {
      const reply = await call<ApiError>(api, 'POST', '/sync', { token, body: { actions: [] } });
      expect(reply.status).toBe(401);
      expect(reply.json.error).toBe('unauthorized');
      expect(reply.text).not.toContain('houseId');
    }
  });

  it('ein Name muss vorhanden und kurz sein', async () => {
    for (const name of ['', '   ', 'x'.repeat(25)]) {
      expect((await call(api, 'POST', '/houses', { body: { name } })).status, JSON.stringify(name)).toBe(400);
    }
  });
});

describe('Obergrenze an Häusern', () => {
  it('ist die Grenze erreicht, legt der Server kein weiteres Haus an', async () => {
    const small = await startLocalApi({ origin: ORIGIN, vars: { MAX_HOUSES: '2' } });
    try {
      expect((await call(small, 'POST', '/houses', { body: { name: 'One' } })).status).toBe(201);
      expect((await call(small, 'POST', '/houses', { body: { name: 'Two' } })).status).toBe(201);
      const third = await call<ApiError>(small, 'POST', '/houses', { body: { name: 'Three' } });
      expect(third.status).toBe(403);
      expect(third.json.error).toBe('house_limit');
    } finally {
      await small.close();
    }
  });
});

describe('Abgleich', () => {
  it('eine Aktion von A steht nach dem Abgleich in der Sicht von B', async () => {
    const { a, b } = await pair(api);
    const before = await sync(api, b.token);
    const deposit = action({ type: 'coupon.deposit', text: 'A walk at sunrise' });

    const sent = await sync(api, a.token, [deposit]);
    expect(sent.status).toBe(200);
    expect(sent.json.results).toEqual([{ id: deposit.id, outcome: 'applied' }]);

    const after = await sync(api, b.token);
    expect(after.json.view.coupons).toHaveLength(before.json.view.coupons.length + 1);
    expect(after.json.view.coupons.find((c) => c.id === deposit.id)).toMatchObject({ kind: 'secret', from: 'a', to: 'b', state: 'veiled' });
  });

  it('eine doppelt gesendete Aktion verändert den Stand nicht zweimal', async () => {
    const { a } = await pair(api);
    const deposit = action({ type: 'coupon.deposit', text: 'Pancakes on Sunday' });

    const first = await sync(api, a.token, [deposit]);
    const stateAfterFirst = await readState(a.view.houseId);
    // Dieselbe Aktion noch einmal – so, als wäre die erste Antwort unterwegs verloren gegangen.
    const second = await sync(api, a.token, [deposit]);
    // … und zweimal in derselben Anfrage, zusammen mit einer neuen.
    const other = action({ type: 'coupon.deposit', text: 'Tea in the garden' });
    const third = await sync(api, a.token, [other, other, deposit]);

    expect(first.json.results).toEqual([{ id: deposit.id, outcome: 'applied' }]);
    expect(second.json.results).toEqual([{ id: deposit.id, outcome: 'duplicate' }]);
    expect(second.json.view).toEqual(first.json.view);
    expect(third.json.results.map((r) => r.outcome)).toEqual(['applied', 'duplicate', 'duplicate']);

    const state = await readState(a.view.houseId);
    const secret = state.coupons.filter((c) => c.kind === 'secret');
    expect(secret.map((c) => c.id).sort()).toEqual([deposit.id, other.id].sort());
    expect(stateAfterFirst.coupons.filter((c) => c.id === deposit.id)).toHaveLength(1);
  });

  it('gleichzeitige Abgleiche beider Geräte gehen nicht verloren', async () => {
    const { a, b } = await pair(api);
    const sent: string[] = [];
    // Jedes Gerät gleicht immer nur einmal zur selben Zeit ab – beide Geräte aber gern im selben Moment.
    for (let round = 0; round < 6; round++) {
      const fromA = action({ type: 'coupon.deposit', text: `from a ${round}` });
      const fromB = action({ type: 'coupon.deposit', text: `from b ${round}` });
      const replies = await Promise.all([sync(api, a.token, [fromA]), sync(api, b.token, [fromB])]);
      expect(replies.map((r) => r.status)).toEqual([200, 200]);
      expect(replies.flatMap((r) => r.json.results.map((x) => x.outcome))).toEqual(['applied', 'applied']);
      sent.push(fromA.id, fromB.id);
    }
    const ids = (await readState(a.view.houseId)).coupons.map((c) => c.id);
    for (const id of sent) expect(ids.filter((x) => x === id)).toHaveLength(1);
  });

  it('unter Andrang gilt: angewendet oder "bitte erneut" – nie halb und nie doppelt', async () => {
    const { a, b } = await pair(api);
    const burst = Array.from({ length: 8 }, (_, i) => ({ token: i % 2 ? a.token : b.token, sent: action({ type: 'coupon.deposit', text: `burst ${i}` }) }));

    const replies = await Promise.all(burst.map((x) => sync(api, x.token, [x.sent])));
    const busy = burst.filter((_, i) => replies[i]?.status === 503);
    for (const reply of replies) expect([200, 503]).toContain(reply.status);
    for (const reply of replies) if (reply.status === 503) expect((reply.json as unknown as ApiError).error).toBe('busy');

    // Was "bitte erneut" bekam, steht noch nicht im Stand …
    const between = (await readState(a.view.houseId)).coupons.map((c) => c.id);
    for (const x of burst) expect(between.includes(x.sent.id)).toBe(!busy.includes(x));
    // … und kommt beim nächsten Abgleich an, so wie das Gerät es aus seiner Warteschlange nachreicht.
    for (const x of busy) expect((await sync(api, x.token, [x.sent])).json.results[0]?.outcome).toBe('applied');
    const ids = (await readState(a.view.houseId)).coupons.map((c) => c.id);
    for (const x of burst) expect(ids.filter((id) => id === x.sent.id)).toHaveLength(1);
  });

  it('eine abgelehnte Aktion bekommt ein Ergebnis, ändert nichts und wird nicht erneut geprüft', async () => {
    // Allein im Haus: Gespielt wird erst zu zweit.
    const a = (await call<EnterHouseResponse>(api, 'POST', '/houses', { body: { name: 'Ada' } })).json;
    const early = action({ type: 'coupon.deposit', text: 'Too early' });

    const first = await sync(api, a.token, [early]);
    expect(first.json.results).toEqual([{ id: early.id, outcome: 'rejected', reason: 'invalid' }]);
    expect((await readState(a.view.houseId)).coupons.some((c) => c.id === early.id)).toBe(false);

    // Auch nachdem B da ist, bleibt diese id erledigt – das Gerät hat sie längst aus der Warteschlange genommen.
    await call(api, 'POST', '/houses/join', { body: { code: a.view.pairingCode, name: 'Bao' } });
    const later = await sync(api, a.token, [early]);
    expect(later.json.results).toEqual([{ id: early.id, outcome: 'duplicate' }]);
    expect((await readState(a.view.houseId)).coupons.some((c) => c.id === early.id)).toBe(false);
  });

  it('fehlerhafte Anfragen werden abgewiesen, ohne den Stand zu ändern', async () => {
    const { a } = await pair(api);
    const before = await readState(a.view.houseId);
    const good = action({ type: 'coupon.deposit', text: 'ok' });
    const bad: unknown[] = [
      { actions: [{ ...good, type: 'house.burn' }] },
      { actions: [{ ...good, text: 'x'.repeat(201) }] },
      { actions: [{ ...good, extra: true }] },
      { actions: [{ ...good, id: 'short' }] },
      { actions: Array.from({ length: 51 }, () => action({ type: 'coupon.deposit', text: 'many' })) },
      { nothing: true },
    ];
    for (const body of bad) expect((await call(api, 'POST', '/sync', { token: a.token, body })).status).toBe(400);
    expect(await readState(a.view.houseId)).toEqual(before);
  });
});

describe('Verborgenes bleibt auf dem Server', () => {
  it('der Text eines geheimen Gutscheins steht in keiner Antwort an das andere Gerät', async () => {
    const { a, b } = await pair(api);
    const secret = 'Zimtschnecken-Geheimnis-7431';
    const deposit = action({ type: 'coupon.deposit', text: secret });

    const sent = await sync(api, a.token, [deposit]);
    const seenByB = await sync(api, b.token);

    // Wer schenkt, sieht seinen Text. Wer beschenkt wird, sieht nur, dass etwas wartet.
    expect(sent.text).toContain(secret);
    expect(sent.json.view.coupons.find((c) => c.id === deposit.id)?.text).toBe(secret);
    expect(seenByB.text).not.toContain(secret);
    expect(seenByB.json.view.coupons.find((c) => c.id === deposit.id)).toMatchObject({ state: 'veiled', text: null });
  });

  it('Kennst-du-mich: die Antwort des anderen steht erst nach beidseitiger Abgabe in der Antwort', async () => {
    // Bis zur ersten Frage mit frei getippter Antwort spielen, eine Aufgabe pro Tag.
    const index = chapter.tasks.findIndex((t) => t.type === 'knowme' && t.answer.kind === 'text');
    expect(index, 'Inhalte ohne Frage mit freier Antwort').toBeGreaterThanOrEqual(0);
    const question = chapter.tasks[index]!;
    const players = await pair(api, undefined, noon(START));
    const { a, b } = players;
    const now = noon(await playTasks(api, players, index, START));
    const own = 'Antwort-von-A-5521';
    const guess = 'Tipp-von-A-9087';

    // Nur A hat abgegeben – und sieht die eigene Abgabe.
    const submit = (ownText: string, guessText: string) =>
      action({ type: 'knowme.submit', taskId: question.id, own: { kind: 'text', text: ownText }, guess: { kind: 'text', text: guessText } });
    const forA = await sync(api, a.token, [submit(own, guess)], now);
    expect(forA.json.results).toMatchObject([{ outcome: 'applied' }]);
    expect(forA.json.view.task?.progress).toMatchObject({ mine: { own: { text: own } }, theirsSubmitted: false, theirs: null });

    const forB = await sync(api, b.token, [], now);
    expect(forB.text).not.toContain(own);
    expect(forB.text).not.toContain(guess);
    expect(forB.json.view.task?.progress).toEqual({ type: 'knowme', mine: null, theirsSubmitted: true, theirs: null, hearts: [], judged: [] });

    // Jetzt gibt auch B ab: aufgedeckt, für beide.
    const revealed = await sync(api, b.token, [submit('Antwort-von-B', 'Tipp-von-B')], now);
    expect(revealed.text).toContain(own);
    expect(revealed.json.view.task?.progress).toMatchObject({ theirsSubmitted: true, theirs: { own: { text: own }, guess: { text: guess } } });
    expect((await sync(api, a.token, [], now)).json.view.task?.progress).toMatchObject({ theirs: { own: { text: 'Antwort-von-B' } } });
  });
});

describe('CORS nur für die App-Adresse', () => {
  it('Antworten geben nur die App-Adresse frei', async () => {
    const reply = await call(api, 'POST', '/houses', { body: { name: 'Ada' } });
    expect(reply.headers.get('Access-Control-Allow-Origin')).toBe(ORIGIN);

    const preflight = await call(api, 'OPTIONS', '/sync');
    expect(preflight.status).toBe(204);
    expect(preflight.headers.get('Access-Control-Allow-Origin')).toBe(ORIGIN);
    expect(preflight.headers.get('Access-Control-Allow-Headers')).toContain('Authorization');
    expect(preflight.headers.get('Access-Control-Allow-Methods')).toContain('PUT');
  });

  it('fremde oder fehlende Herkunft wird abgewiesen und bekommt keine Freigabe', async () => {
    const { a } = await pair(api);
    for (const origin of ['https://evil.example', `${ORIGIN}.evil.example`, null]) {
      for (const method of ['POST', 'OPTIONS']) {
        const reply = await call<ApiError>(api, method, '/sync', { origin, token: a.token, body: method === 'POST' ? { actions: [] } : undefined });
        expect(reply.status, `${method} ${origin}`).toBe(403);
        expect(reply.headers.get('Access-Control-Allow-Origin')).toBeNull();
        expect(reply.text).not.toContain('houseId');
      }
    }
  });

  it('das Lebenszeichen verrät nichts', async () => {
    const reply = await call(api, 'GET', '/', { origin: null });
    expect(reply.status).toBe(200);
    expect(reply.text.trim()).toBe('paartrip-api ok');
  });
});
