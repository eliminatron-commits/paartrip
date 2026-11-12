// Karte und Legende. Rolle 1 sieht den Grundriss: Wände, Zeichen ohne Namen und mögliche Verstecke.
// Rolle 2 hat die Legende (welches Zeichen was ist) und die Hinweise auf die Verstecke, in denen etwas liegt.
// Gesucht sind mehrere Verstecke auf einmal, und geprüft wird nur die ganze Auswahl – ein einzelnes Versteck
// anzutippen verrät nichts, sonst ließe sich das Rätsel allein durch Probieren lösen.
//
// Der Grundriss ist ein Raster aus Zeichen, eine Zeile je Reihe:
//   '#' Wand · '.' Boden · 'a'–'z' ein Zeichen aus `landmarks` · '1'–'9' ein mögliches Versteck
import { duplicates, type Glyph, MIN_ATTEMPTS } from './tiles.ts';

export interface Landmark {
  /** Buchstabe im Grundriss. */
  key: string;
  /** Wie das Zeichen im Grundriss aussieht. Es darf nicht verraten, wofür es steht. */
  glyph: Glyph;
  /** Was das Zeichen bedeutet, z. B. "the stove" – steht nur in der Legende. */
  name: string;
}

export interface MapLegendData {
  plan: string[];
  landmarks: Landmark[];
  /** Hinweise auf die Verstecke, wie Rolle 2 sie vorliest. */
  clues: string[];
  /** Ziffern der Verstecke, in denen etwas liegt. */
  treasures: string[];
}

/** Die Ziffern der markierten Verstecke. */
export type MapLegendAttempt = string[];

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

/** Auf wie viele Arten sich `pick` aus `from` Verstecken auswählen lassen. */
function selections(from: number, pick: number): number {
  let count = 1;
  for (let i = 1; i <= pick; i++) count = (count * (from - pick + i)) / i;
  return count;
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
  // Heißt das Zeichen wie das, wofür es steht, braucht Rolle 1 die Legende nicht.
  for (const landmark of data.landmarks) {
    if (landmark.name.toLowerCase().includes(landmark.glyph)) problems.push(`landmarks: das Zeichen "${landmark.glyph}" verrät, wofür es steht ("${landmark.name}")`);
  }

  const spots = chars.filter((c) => /^[1-9]$/.test(c));
  for (const dup of duplicates(spots, (c) => c)) problems.push(`plan: Versteck "${dup}" steht mehrfach im Grundriss`);
  for (const dup of duplicates(data.treasures, (t) => t)) problems.push(`treasures: Versteck "${dup}" doppelt`);
  for (const treasure of new Set(data.treasures)) {
    if (!spots.includes(treasure)) problems.push(`treasures: Versteck "${treasure}" fehlt im Grundriss`);
  }
  const possible = selections(new Set(spots).size, new Set(data.treasures).size);
  if (possible < MIN_ATTEMPTS) {
    problems.push(`plan: ${data.treasures.length} aus ${spots.length} Verstecken lassen nur ${possible} Auswahlen zu – mindestens ${MIN_ATTEMPTS}, sonst genügt Probieren`);
  }
  return problems;
}

export function solution(data: MapLegendData): MapLegendAttempt {
  return [...data.treasures].sort();
}

/** Gelöst ist es nur mit genau den richtigen Verstecken – eines zu viel oder zu wenig gilt nicht. */
export function isSolved(data: MapLegendData, attempt: MapLegendAttempt): boolean {
  return [...new Set(attempt)].sort().join() === solution(data).join();
}
