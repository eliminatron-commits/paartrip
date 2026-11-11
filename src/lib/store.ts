// Lokale Kopie in IndexedDB: Geräte-Token, letzte Sicht vom Server, wartende Aktionen, Einstellungen.
// Jede Aktion wird hier gesichert, bevor irgendetwas anderes geschieht – iOS beendet Home-Bildschirm-Apps
// ohne Vorwarnung. Die Sicht kommt immer vom Server; das Gerät schreibt sie nie selbst um.
import type { Action } from '../../shared/actions.ts';
import type { HouseView, Slot } from '../../shared/model.ts';

/** Was dieses Gerät als Mitspieler ausweist. Das Token ist geheim. */
export interface DeviceRecord {
  token: string;
  houseId: string;
  slot: Slot;
}

export interface Settings {
  /** Der Nutzer hat Mitteilungen auf diesem Gerät eingeschaltet. */
  push: boolean;
}

export const DEFAULT_SETTINGS: Settings = { push: false };

export interface Stored {
  device: DeviceRecord | null;
  view: HouseView | null;
  /** Wartende Aktionen in der Reihenfolge, in der sie entstanden sind. */
  queue: Action[];
  settings: Settings;
}

export interface LocalStore {
  load(): Promise<Stored>;
  /** Nach Anlegen oder Beitreten: Gerät und erste Sicht sichern. */
  enter(device: DeviceRecord, view: HouseView): Promise<void>;
  enqueue(action: Action): Promise<void>;
  /** Ergebnis eines Abgleichs in einem Schritt: neue Sicht sichern, erledigte Aktionen aus der Warteschlange nehmen. */
  commitSync(view: HouseView | null, settledIds: string[]): Promise<void>;
  saveSettings(settings: Settings): Promise<void>;
  /** Ersetzt alles (Import eines Gerätestands). */
  replaceAll(stored: Stored): Promise<void>;
}

const KV = 'kv';
const QUEUE = 'queue';

function done(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('IndexedDB-Fehler'));
    tx.onabort = () => reject(tx.error ?? new Error('IndexedDB-Transaktion abgebrochen'));
  });
}

function result<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB-Fehler'));
  });
}

function open(name: string, factory: IDBFactory): Promise<IDBDatabase> {
  const request = factory.open(name, 1);
  request.onupgradeneeded = () => {
    request.result.createObjectStore(KV);
    // Fortlaufender Schlüssel = Reihenfolge der Warteschlange.
    request.result.createObjectStore(QUEUE, { autoIncrement: true });
  };
  return result(request);
}

export async function openStore(name = 'paartrip', factory: IDBFactory = indexedDB): Promise<LocalStore> {
  const db = await open(name, factory);

  return {
    async load() {
      const tx = db.transaction([KV, QUEUE], 'readonly');
      const kv = tx.objectStore(KV);
      const [device, view, settings, queue] = await Promise.all([
        result(kv.get('device') as IDBRequest<DeviceRecord | undefined>),
        result(kv.get('view') as IDBRequest<HouseView | undefined>),
        result(kv.get('settings') as IDBRequest<Partial<Settings> | undefined>),
        result(tx.objectStore(QUEUE).getAll() as IDBRequest<Action[]>),
      ]);
      return { device: device ?? null, view: view ?? null, queue, settings: { ...DEFAULT_SETTINGS, ...settings } };
    },

    async enter(device, view) {
      const tx = db.transaction(KV, 'readwrite');
      tx.objectStore(KV).put(device, 'device');
      tx.objectStore(KV).put(view, 'view');
      await done(tx);
    },

    async enqueue(action) {
      const tx = db.transaction(QUEUE, 'readwrite');
      tx.objectStore(QUEUE).add(action);
      await done(tx);
    },

    async commitSync(view, settledIds) {
      const settled = new Set(settledIds);
      const tx = db.transaction([KV, QUEUE], 'readwrite');
      if (view) tx.objectStore(KV).put(view, 'view');
      const cursorRequest = tx.objectStore(QUEUE).openCursor();
      cursorRequest.onsuccess = () => {
        const cursor = cursorRequest.result;
        if (!cursor) return;
        if (settled.has((cursor.value as Action).id)) cursor.delete();
        cursor.continue();
      };
      await done(tx);
    },

    async saveSettings(settings) {
      const tx = db.transaction(KV, 'readwrite');
      tx.objectStore(KV).put(settings, 'settings');
      await done(tx);
    },

    async replaceAll(stored) {
      const tx = db.transaction([KV, QUEUE], 'readwrite');
      const kv = tx.objectStore(KV);
      const queue = tx.objectStore(QUEUE);
      kv.clear();
      queue.clear();
      if (stored.device) kv.put(stored.device, 'device');
      if (stored.view) kv.put(stored.view, 'view');
      kv.put(stored.settings, 'settings');
      for (const action of stored.queue) queue.add(action);
      await done(tx);
    },
  };
}
