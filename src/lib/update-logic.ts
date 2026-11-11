// Reine Regeln des Update-Ablaufs, getrennt vom Browser-Teil (update.svelte.ts), damit sie testbar sind.

/** Automatische Suche bei Rückkehr in die App: höchstens einmal pro Minute. */
export const AUTO_CHECK_INTERVAL_MS = 60_000;

export function shouldAutoCheck(now: number, lastCheck: number | null): boolean {
  return lastCheck === null || now - lastCheck >= AUTO_CHECK_INTERVAL_MS;
}

/**
 * Wartet eine neue Version auf das Tippen des Nutzers? Nur wenn ein fertig installierter Worker wartet
 * und zugleich ein älterer aktiv ist. Bei der Erstinstallation gibt es keinen Vorgänger: Der Worker
 * wartet nie, er übernimmt sofort.
 * Bewusst ohne Blick darauf, ob die Seite schon gesteuert wird – das kann bereits der Fall sein, wenn
 * eine beschäftigte Seite erst verspätet vom Zustand "installed" erfährt.
 */
export function updateIsWaiting(registration: { waiting: unknown; active: unknown }): boolean {
  return registration.waiting != null && registration.active != null;
}

export type CheckResult = 'current' | 'found' | 'failed';

export const CHECK_MESSAGES: Record<CheckResult, string> = {
  current: "You're up to date.",
  found: 'New version found.',
  failed: "Couldn't check. Are you offline?",
};
