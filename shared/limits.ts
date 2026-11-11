// Längen und der Kopplungscode – von Oberfläche, Prüfung der Anfragen und Worker gemeinsam genutzt.

export const LIMITS = {
  nameLength: 24,
  couponTextLength: 200,
  knowMeTextLength: 120,
  /** Aktionen je Abgleich; das Gerät reicht eine längere Warteschlange in Teilen ein. */
  actionsPerSync: 50,
} as const;

/** Kopplungscode: 8 Zeichen ohne verwechselbare (kein 0/O, 1/I/L). */
export const CODE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
export const CODE_LENGTH = 8;

/** Vereinheitlicht eine Code-Eingabe: Großbuchstaben, ohne Leerzeichen und Bindestriche. */
export function normalizeCode(input: string): string {
  return input.toUpperCase().replace(/[^0-9A-Z]/g, '');
}

/** Anzeigeform "ABCD-EFGH". */
export function formatCode(code: string): string {
  return code.length === CODE_LENGTH ? `${code.slice(0, 4)}-${code.slice(4)}` : code;
}
