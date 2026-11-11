// Update-Funktion: iOS holt eine Home-Bildschirm-App aus dem Hintergrund zurück, ohne neu zu laden.
// Deshalb sucht die App selbst nach neuen Versionen, zeigt einen Hinweis und übernimmt erst auf Tippen.
import { type CheckResult, shouldAutoCheck } from './update-logic.ts';

export const updates = $state<{ available: boolean; checking: boolean; result: CheckResult | null }>({
  available: false,
  checking: false,
  result: null,
});

let registration: ServiceWorkerRegistration | null = null;
let lastCheck: number | null = null;
let applying = false;

export async function initUpdates(): Promise<void> {
  // Im Dev-Server gibt es keinen Service Worker.
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;

  navigator.serviceWorker.addEventListener('controllerchange', () => {
    // Nur nach dem Tippen auf "Update" neu laden – nicht bei der Erstinstallation (clients.claim).
    if (applying) location.reload();
  });

  registration = await navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`, {
    scope: import.meta.env.BASE_URL,
  });
  watchForWaitingWorker(registration);

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && shouldAutoCheck(Date.now(), lastCheck)) void checkForUpdate();
  });
}

function watchForWaitingWorker(reg: ServiceWorkerRegistration): void {
  // Ein Worker ohne aktiven Vorgänger ist die Erstinstallation, kein Update.
  if (reg.waiting && navigator.serviceWorker.controller) updates.available = true;
  reg.addEventListener('updatefound', () => {
    const worker = reg.installing;
    worker?.addEventListener('statechange', () => {
      if (worker.state === 'installed' && navigator.serviceWorker.controller) updates.available = true;
    });
  });
}

/** Wartet, bis ein gerade gefundener Worker fertig installiert (oder gescheitert) ist. */
function installed(worker: ServiceWorker): Promise<boolean> {
  return new Promise((resolve) => {
    const settle = () => {
      if (worker.state === 'installed' || worker.state === 'activating' || worker.state === 'activated') resolve(true);
      else if (worker.state === 'redundant') resolve(false);
    };
    worker.addEventListener('statechange', settle);
    settle();
  });
}

/** Sucht sofort nach einer neuen Version und meldet das Ergebnis (auch für "Check for updates"). */
export async function checkForUpdate(): Promise<CheckResult> {
  updates.checking = true;
  lastCheck = Date.now();
  let result: CheckResult = 'failed';
  try {
    if (registration) {
      await registration.update();
      const found = registration.installing ? await installed(registration.installing) : registration.waiting !== null;
      result = found ? 'found' : 'current';
    }
  } catch {
    result = 'failed';
  }
  updates.checking = false;
  updates.result = result;
  return result;
}

/** Vom Hinweis "New version – Update" aufgerufen: wartenden Worker übernehmen, danach lädt die Seite neu. */
export function applyUpdate(): void {
  const waiting = registration?.waiting;
  if (!waiting) return;
  applying = true;
  waiting.postMessage({ type: 'SKIP_WAITING' });
}
