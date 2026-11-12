// Abgleich mit dem Server. Das Gerät hält nur eine Kopie: die letzte Sicht vom Server und eine
// Warteschlange eigener Aktionen. Jede Aktion wird zuerst lokal gesichert und dann eingereicht;
// kommt sie nicht durch, bleibt sie in der Warteschlange und geht beim nächsten Abgleich mit.
// Die Sicht schreibt das Gerät nie selbst um – was gilt, sagt der Server.
//
// Ohne Svelte und ohne Browser-Ereignisse geschrieben, damit Vitest die Logik prüfen kann.
import type { Action, ActionBody } from '../../shared/actions.ts';
import type { EnterHouseResponse } from '../../shared/api.ts';
import { LIMITS } from '../../shared/limits.ts';
import type { HouseView } from '../../shared/model.ts';
import { ApiFailure, type FailureCode, type Transport } from './api.ts';
import { buildDeviceFile, type DeviceFile, parseDeviceFile } from './device-file.ts';
import { DEFAULT_SETTINGS, type DeviceRecord, type LocalStore, type Settings, type Stored } from './store.ts';

export interface Snapshot {
  /** loading: lokale Kopie wird gelesen. unpaired: dieses Gerät gehört zu keinem Haus. */
  status: 'loading' | 'unpaired' | 'paired';
  view: HouseView | null;
  /** Eigene Aktionen, die der Server noch nicht bestätigt hat. */
  pending: number;
  syncing: boolean;
  /** Der letzte Abgleich hat den Server nicht erreicht. */
  offline: boolean;
  /** Fehler des letzten Abgleichs, der kein Verbindungsproblem war (z. B. Gerät nicht mehr gekoppelt). */
  error: FailureCode | null;
  /** Aktionen, die der Server abgelehnt hat, seit der Hinweis zuletzt geschlossen wurde. */
  rejected: number;
  settings: Settings;
}

export const INITIAL_SNAPSHOT: Snapshot = {
  status: 'loading',
  view: null,
  pending: 0,
  syncing: false,
  offline: false,
  error: null,
  rejected: 0,
  settings: { ...DEFAULT_SETTINGS },
};

export interface Clock {
  now(): Date;
  id(): string;
}

const systemClock: Clock = { now: () => new Date(), id: () => crypto.randomUUID() };

/** Meldet der Server "gleichzeitige Änderung", versucht es das Gerät so oft von selbst noch einmal. */
const BUSY_RETRIES = 2;
const BUSY_PAUSE_MS = 250;

export class SyncEngine {
  private store: LocalStore;
  private transport: Pick<Transport, 'createHouse' | 'joinHouse' | 'sync'>;
  private onChange: (snapshot: Snapshot) => void;
  private clock: Clock;

  private device: DeviceRecord | null = null;
  private queue: Action[] = [];
  private snapshot: Snapshot = { ...INITIAL_SNAPSHOT };
  private running: Promise<void> | null = null;
  private again = false;
  /** Das Gerät wechselt gerade seine Rolle (Import, Neuanfang): solange beginnt kein Abgleich. */
  private switching = false;

  constructor(store: LocalStore, transport: Pick<Transport, 'createHouse' | 'joinHouse' | 'sync'>, onChange: (snapshot: Snapshot) => void, clock: Clock = systemClock) {
    this.store = store;
    this.transport = transport;
    this.onChange = onChange;
    this.clock = clock;
  }

  /** Geheimes Token dieses Geräts, für die Push-Routen. */
  get token(): string | null {
    return this.device?.token ?? null;
  }

  private emit(patch: Partial<Snapshot>): void {
    this.snapshot = { ...this.snapshot, ...patch, pending: this.queue.length };
    this.onChange(this.snapshot);
  }

  /** Liest die lokale Kopie – damit startet die App auch ohne Netz mit dem letzten Stand. */
  async load(): Promise<void> {
    const stored = await this.store.load();
    this.device = stored.device;
    this.queue = stored.queue;
    this.emit({ status: stored.device ? 'paired' : 'unpaired', view: stored.view, settings: stored.settings });
  }

  async createHouse(name: string): Promise<void> {
    await this.enter(await this.transport.createHouse({ name }));
  }

  async joinHouse(code: string, name: string): Promise<void> {
    await this.enter(await this.transport.joinHouse({ code, name }));
  }

  private async enter(response: EnterHouseResponse): Promise<void> {
    const device: DeviceRecord = { token: response.token, houseId: response.view.houseId, slot: response.view.you };
    await this.store.enter(device, response.view);
    this.device = device;
    this.emit({ status: 'paired', view: response.view, offline: false, error: null });
  }

  /** Eigene Aktion: erst lokal sichern, dann einreichen. Kehrt zurück, wenn der Abgleichsversuch vorbei ist. */
  async dispatch(body: ActionBody): Promise<void> {
    if (!this.device || this.switching) throw new Error('Gerät ist nicht gekoppelt');
    const action = { ...body, id: this.clock.id(), at: this.clock.now().toISOString() } as Action;
    await this.store.enqueue(action);
    this.queue.push(action);
    this.emit({});
    await this.sync();
  }

  /** Reicht wartende Aktionen ein und holt die aktuelle Sicht. Läuft schon ein Abgleich, folgt danach ein weiterer. */
  sync(): Promise<void> {
    if (!this.device || this.switching) return Promise.resolve();
    if (this.running) {
      this.again = true;
      return this.running;
    }
    const device = this.device;
    // Erst merken, dann starten: `running` steht schon, bevor der Lauf seine erste Zeile ausführt.
    // Nur so kann ein Rollenwechsel (switchDevice) sicher auf jeden begonnenen Lauf warten.
    this.running = Promise.resolve()
      .then(() => this.run(device))
      .finally(() => {
        this.running = null;
      });
    return this.running;
  }

  private async run(device: DeviceRecord): Promise<void> {
    this.emit({ syncing: true });
    let chunk: number = LIMITS.actionsPerSync;
    let busyRetries = BUSY_RETRIES;
    try {
      let more = true;
      while (more) {
        this.again = false;
        const batch = this.queue.slice(0, chunk);
        try {
          const response = await this.transport.sync(device.token, { actions: batch });
          const settled = response.results.map((r) => r.id);
          await this.store.commitSync(response.view, settled);
          this.queue = this.queue.filter((a) => !settled.includes(a.id));
          const rejected = response.results.filter((r) => r.outcome === 'rejected').length;
          this.emit({ view: response.view, offline: false, error: null, rejected: this.snapshot.rejected + rejected });
          // Weiter, wenn inzwischen Neues kam oder die Warteschlange länger war als ein Teil.
          more = this.again || (this.queue.length > 0 && settled.length > 0);
        } catch (error) {
          // Der Server hat die Anfrage als fehlerhaft abgewiesen. Damit nichts festhängt: einzeln einreichen
          // und die eine Aktion, die er auch einzeln nicht annimmt, aufgeben.
          if (error instanceof ApiFailure && error.code === 'bad_request' && batch.length > 0) {
            if (batch.length > 1) {
              chunk = 1;
            } else {
              const dropped = batch.map((a) => a.id);
              await this.store.commitSync(null, dropped);
              this.queue = this.queue.filter((a) => !dropped.includes(a.id));
              this.emit({ rejected: this.snapshot.rejected + 1 });
            }
            continue;
          }
          // Beide Geräte haben im selben Moment geschrieben: kurz warten und noch einmal.
          if (error instanceof ApiFailure && error.code === 'busy' && busyRetries > 0) {
            busyRetries -= 1;
            await new Promise((done) => setTimeout(done, BUSY_PAUSE_MS));
            continue;
          }
          throw error;
        }
      }
    } catch (error) {
      if (!(error instanceof ApiFailure)) throw error;
      // Keine Verbindung: Die Warteschlange bleibt, der nächste Abgleich reicht sie nach.
      this.emit(error.code === 'offline' ? { offline: true } : { offline: false, error: error.code });
    } finally {
      this.emit({ syncing: false });
    }
  }

  /** Hinweis auf abgelehnte Aktionen schließen. */
  dismissRejected(): void {
    this.emit({ rejected: 0 });
  }

  async updateSettings(patch: Partial<Settings>): Promise<void> {
    const settings = { ...this.snapshot.settings, ...patch };
    await this.store.saveSettings(settings);
    this.emit({ settings });
  }

  async exportDevice(): Promise<DeviceFile> {
    return buildDeviceFile(await this.store.load(), this.clock.now());
  }

  /**
   * Ersetzt alles, was dieses Gerät ausmacht. Ein laufender Abgleich der bisherigen Rolle endet erst,
   * ein neuer beginnt währenddessen nicht – sonst gingen Aktionen der neuen Rolle mit dem alten Token raus.
   */
  private async switchDevice(stored: Stored, patch: Partial<Snapshot>): Promise<void> {
    this.switching = true;
    try {
      await this.running;
      await this.store.replaceAll(stored);
      this.device = stored.device;
      this.queue = stored.queue;
      this.emit({ view: stored.view, settings: stored.settings, offline: false, error: null, rejected: 0, ...patch });
    } finally {
      this.switching = false;
    }
  }

  /** Übernimmt einen exportierten Gerätestand und gleicht sofort ab. Wirft DeviceFileError bei unlesbarer Datei. */
  async importDevice(text: string): Promise<void> {
    const { stored, dropped } = parseDeviceFile(text);
    await this.switchDevice(stored, { status: 'paired', rejected: dropped });
    await this.sync();
  }

  /**
   * Löst die Kopplung auf diesem Gerät, etwa wenn der Server das Haus nicht mehr kennt: Token, Sicht und
   * Warteschlange sind danach weg, das Gerät kann ein Haus anlegen oder einem beitreten.
   */
  async reset(): Promise<void> {
    await this.switchDevice({ device: null, view: null, queue: [], settings: { ...DEFAULT_SETTINGS } }, { status: 'unpaired' });
  }
}
