// Beschreiben und Anordnen. Rolle 1 sieht das Zielbild: Teile in einem Raster. Rolle 2 hat das leere Raster
// und einen Vorrat an Teilen (mehr, als gebraucht werden) und legt nach, was Rolle 1 beschreibt.
import { duplicates, type Glyph, MIN_ATTEMPTS } from './tiles.ts';

export interface DescribeArrangeData {
  cols: number;
  rows: number;
  /** Vorrat von Rolle 2. Teile, die im Zielbild nicht vorkommen, sind Ablenkung. */
  tiles: Glyph[];
  /** Zielbild, Zeile für Zeile: Nummer des Teils im Vorrat (ab 0) oder null für ein leeres Feld. */
  target: (number | null)[];
}

/** Das gelegte Bild, aufgebaut wie `target`. */
export type DescribeArrangeAttempt = (number | null)[];

export function validate(data: DescribeArrangeData): string[] {
  const problems: string[] = [];
  if (data.target.length !== data.cols * data.rows) problems.push(`target: braucht ${data.cols * data.rows} Felder, hat ${data.target.length}`);
  const used = data.target.filter((t): t is number => t !== null);
  for (const index of used) if (data.tiles[index] === undefined) problems.push(`target: Teil ${index} gibt es nicht im Vorrat`);
  for (const dup of duplicates(used, String)) problems.push(`target: Teil ${dup} liegt auf zwei Feldern`);
  for (const dup of duplicates(data.tiles, (glyph) => glyph)) problems.push(`tiles: "${dup}" doppelt – am Telefon nicht zu unterscheiden`);
  if (used.length < 3) problems.push('target: mindestens drei Teile');
  const possible = pictures(data.tiles.length, data.cols * data.rows, new Set(used).size);
  if (possible < MIN_ATTEMPTS) {
    problems.push(`target: ${used.length} von ${data.tiles.length} Teilen auf ${data.cols * data.rows} Feldern lassen nur ${possible} Bilder zu – mindestens ${MIN_ATTEMPTS}, sonst genügt Probieren`);
  }
  return problems;
}

/** Wie viele Bilder sich legen lassen, wenn man weiß, wie viele Teile gebraucht werden: Auswahl der Teile mal ihre Plätze. */
function pictures(tiles: number, cells: number, used: number): number {
  let count = 1;
  for (let i = 0; i < used; i++) count *= ((tiles - i) / (i + 1)) * (cells - i);
  return Math.max(Math.round(count), 0);
}

export function solution(data: DescribeArrangeData): DescribeArrangeAttempt {
  return [...data.target];
}

export function isSolved(data: DescribeArrangeData, attempt: DescribeArrangeAttempt): boolean {
  return attempt.length === data.target.length && attempt.every((tile, cell) => tile === data.target[cell]);
}
