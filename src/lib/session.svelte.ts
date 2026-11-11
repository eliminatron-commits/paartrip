// Zustand der App für die Oberfläche: verbindet den Abgleich (sync-engine.ts) mit IndexedDB, dem Worker
// und den Ereignissen des Browsers. Abgeglichen wird beim Öffnen, bei Rückkehr in die App, sobald das
// Netz zurück ist und nach jeder eigenen Aktion.
import type { ActionBody } from '../../shared/actions.ts';
import { createTransport, type Transport } from './api.ts';
import { deviceFileName } from './device-file.ts';
import { openStore, type Settings } from './store.ts';
import { INITIAL_SNAPSHOT, type Snapshot, SyncEngine } from './sync-engine.ts';

export const session = $state<Snapshot & { storageFailed: boolean }>({ ...INITIAL_SNAPSHOT, storageFailed: false });

export const transport: Transport = createTransport(import.meta.env.VITE_API_URL);

let engine: SyncEngine | null = null;

function ready(): SyncEngine {
  if (!engine) throw new Error('Sitzung ist noch nicht bereit');
  return engine;
}

/** Abgleich anstoßen, ohne auf das Ergebnis zu warten; Fehler landen im Zustand, nicht in der Konsole. */
function syncSoon(): void {
  void engine?.sync().catch((error: unknown) => console.error(error));
}

export async function initSession(): Promise<void> {
  try {
    const store = await openStore();
    engine = new SyncEngine(store, transport, (snapshot) => Object.assign(session, snapshot));
    await engine.load();
  } catch (error) {
    // Ohne lokalen Speicher (z. B. privater Modus) kann die App keinen Stand halten.
    console.error(error);
    session.status = 'unpaired';
    session.storageFailed = true;
    return;
  }

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') syncSoon();
  });
  window.addEventListener('online', syncSoon);
  syncSoon();
}

export const createHouse = (name: string) => ready().createHouse(name);
export const joinHouse = (code: string, name: string) => ready().joinHouse(code, name);
export const dispatch = (body: ActionBody) => ready().dispatch(body);
export const syncNow = () => ready().sync();
export const dismissRejected = () => ready().dismissRejected();
export const updateSettings = (patch: Partial<Settings>) => ready().updateSettings(patch);
export const importDevice = (text: string) => ready().importDevice(text);
export const deviceToken = () => engine?.token ?? null;

/** Gerätestand als Datei: auf dem iPhone über das Teilen-Menü ("In Dateien sichern"), sonst als Download. */
export async function exportDevice(): Promise<void> {
  const data = await ready().exportDevice();
  const name = deviceFileName(new Date(data.exportedAt));
  const file = new File([JSON.stringify(data, null, 2)], name, { type: 'application/json' });

  if (typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: 'PaarTrip backup' });
      return;
    } catch (error) {
      // Abbruch durch den Nutzer ist kein Fehler; alles andere fällt auf den Download zurück.
      if ((error as DOMException).name === 'AbortError') return;
    }
  }
  const link = document.createElement('a');
  link.href = URL.createObjectURL(file);
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 10_000);
}
