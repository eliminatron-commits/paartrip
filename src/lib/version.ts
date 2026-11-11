// Versionszeile "Version · Build-Zeit · Commit": daran liest der Nutzer ab, welchen Stand sein Gerät hat.

/** Build-Zeit als "2026-11-11 16:42" in der Zeitzone des Geräts (oder der angegebenen). */
export function formatBuildTime(iso: string, timeZone?: string): string {
  // sv-SE liefert das ISO-ähnliche Format mit Leerzeichen.
  return new Intl.DateTimeFormat('sv-SE', { dateStyle: 'short', timeStyle: 'short', timeZone }).format(new Date(iso));
}

export function formatVersionLine(version: string, buildTimeIso: string, commit: string, timeZone?: string): string {
  return `Version ${version} · ${formatBuildTime(buildTimeIso, timeZone)} · ${commit}`;
}

export const versionLine = formatVersionLine(__APP_VERSION__, __BUILD_TIME__, __COMMIT__);
