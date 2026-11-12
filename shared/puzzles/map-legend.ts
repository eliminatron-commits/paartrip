// Karte und Legende. Rolle 1 sieht den Grundriss: Wände, Zeichen ohne Namen und mögliche Verstecke.
// Rolle 2 hat die Legende (welches Zeichen was ist) und die Hinweise auf das Versteck.
//
// Der Grundriss ist ein Raster aus Zeichen, eine Zeile je Reihe:
//   '#' Wand · '.' Boden · 'a'–'z' ein Zeichen aus `landmarks` · '1'–'9' ein mögliches Versteck
import { duplicates, type Glyph } from './tiles.ts';

export interface Landmark {
  /** Buchstabe im Grundriss. */
  key: string;
  /** Wie das Zeichen im Grundriss aussieht. */
  glyph: Glyph;
  /** Was das Zeichen bedeutet, z. B. "the stove" – steht nur in der Legende. */
  name: string;
}

export interface MapLegendData {
  plan: string[];
  landmarks: Landmark[];
  /** Hinweise auf das Versteck, wie Rolle 2 sie vorliest. */
  clues: string[];
  /** Ziffer des Verstecks. */
  treasure: string;
}

/** Die Ziffer des angetippten Verstecks. */
export type MapLegendAttempt = string;

export type PlanCell =
  | { kind: 'wall' | 'floor' }
  | { kind: 'landmark'; key: string }
  | { kind: 'spot'; key: string };

export function planCell(char: string): PlanCell | null {
  if (char === '#') return { kind: 'wall' };
  if (char === '.') return { kind: 'floor' };
  if (/^[a-z]$/.test(char)) return { kind: 'landmark', key: char };
  if (/^[1-9]$/.test(char)) return { kind: 'spot', key: char };
  return null;
}

/** Der Grundriss als Raster von Feldern (Zeile für Zeile). */
export function planCells(data: MapLegendData): PlanCell[][] {
  return data.plan.map((line) => [...line].map((char) => planCell(char) ?? { kind: 'floor' }));
}

export function validate(data: MapLegendData): string[] {
  const problems: string[] = [];
  const width = data.plan[0]?.length ?? 0;
  if (data.plan.some((line) => line.length !== width)) problems.push('plan: die Zeilen sind nicht gleich lang');
  const chars = data.plan.flatMap((line) => [...line]);
  for (const char of new Set(chars)) {
    if (planCell(char) === null) problems.push(`plan: unbekanntes Zeichen "${char}"`);
  }

  const onPlan = chars.filter((c) => /^[a-z]$/.test(c));
  const keys = data.landmarks.map((l) => l.key);
  for (const dup of duplicates(onPlan, (c) => c)) problems.push(`plan: Zeichen "${dup}" steht mehrfach im Grundriss`);
  for (const dup of duplicates(keys, (k) => k)) problems.push(`landmarks: "${dup}" doppelt`);
  for (const key of keys) if (!onPlan.includes(key)) problems.push(`landmarks: "${key}" fehlt im Grundriss`);
  for (const char of onPlan) if (!keys.includes(char)) problems.push(`plan: Zeichen "${char}" fehlt in landmarks`);
  // Zwei gleich aussehende Zeichen ließen sich am Telefon nicht auseinanderhalten.
  for (const dup of duplicates(data.landmarks, (l) => l.glyph)) problems.push(`landmarks: "${dup}" sieht zweimal gleich aus`);

  const spots = chars.filter((c) => /^[1-9]$/.test(c));
  for (const dup of duplicates(spots, (c) => c)) problems.push(`plan: Versteck "${dup}" steht mehrfach im Grundriss`);
  if (spots.length < 4) problems.push('plan: mindestens vier mögliche Verstecke, sonst genügt Raten');
  if (!spots.includes(data.treasure)) problems.push(`treasure: Versteck "${data.treasure}" fehlt im Grundriss`);
  return problems;
}

export function solution(data: MapLegendData): MapLegendAttempt {
  return data.treasure;
}

export function isSolved(data: MapLegendData, attempt: MapLegendAttempt): boolean {
  return attempt === data.treasure;
}
