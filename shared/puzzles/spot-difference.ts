// Zwei Bilder vergleichen. Beide sehen dasselbe Regal, aber je eine eigene Fassung: An einigen Feldern liegt
// bei Rolle 2 etwas anderes (oder nichts). Was abweicht, zeigt sich nur im Gespräch. Beide markieren die
// Felder; abgeschlossen ist das Rätsel, sobald einer genau die richtigen markiert hat.
import { duplicates, type Glyph, MIN_ATTEMPTS } from './tiles.ts';
import type { PuzzleRole } from './kinds.ts';

export interface SpotDifferenceData {
  cols: number;
  rows: number;
  /** Fassung von Rolle 1, Zeile für Zeile; null = leeres Feld. */
  scene: (Glyph | null)[];
  /** Was bei Rolle 2 anders ist: Feld (ab 0) und was dort stattdessen liegt. */
  changes: { cell: number; glyph: Glyph | null }[];
}

/** Die markierten Felder. */
export type SpotDifferenceAttempt = number[];

/** Die Fassung, die diese Rolle sieht. */
export function versionFor(data: SpotDifferenceData, role: PuzzleRole): (Glyph | null)[] {
  if (role === 'lead') return [...data.scene];
  const version = [...data.scene];
  for (const change of data.changes) version[change.cell] = change.glyph;
  return version;
}

export function validate(data: SpotDifferenceData): string[] {
  const problems: string[] = [];
  const cells = data.cols * data.rows;
  if (data.scene.length !== cells) problems.push(`scene: braucht ${cells} Felder, hat ${data.scene.length}`);
  for (const dup of duplicates(data.changes, (c) => String(c.cell))) problems.push(`changes: Feld ${dup} doppelt`);
  data.changes.forEach((change, index) => {
    const before = data.scene[change.cell];
    if (before === undefined) problems.push(`changes.${index}: Feld ${change.cell} gibt es nicht`);
    else if (before === change.glyph) problems.push(`changes.${index}: Feld ${change.cell} sieht in beiden Fassungen gleich aus`);
  });
  if (data.changes.length < 2) problems.push('changes: mindestens zwei Unterschiede');
  // Markieren lässt sich jede Auswahl der Felder.
  if (2 ** cells < MIN_ATTEMPTS) problems.push(`scene: ${cells} Felder lassen nur ${2 ** cells} Markierungen zu – mindestens ${MIN_ATTEMPTS}, sonst genügt Probieren`);
  // Weicht mehr als die Hälfte ab, ist "alles markieren" fast schon die Lösung.
  if (data.changes.length * 2 > cells) problems.push('changes: höchstens die Hälfte der Felder darf abweichen');
  return problems;
}

export function solution(data: SpotDifferenceData): SpotDifferenceAttempt {
  return data.changes.map((c) => c.cell).sort((x, y) => x - y);
}

export function isSolved(data: SpotDifferenceData, attempt: SpotDifferenceAttempt): boolean {
  const marked = [...new Set(attempt)].sort((x, y) => x - y);
  return marked.join() === solution(data).join();
}
