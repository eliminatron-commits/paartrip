// Geteilter Code. Rolle 1 hat das Schloss und für jede Stelle des Codes eine Regel, die auf eine Reihe von
// Symbolen verweist ("das Symbol links vom Mond"). Die Reihe sieht nur Rolle 2. Der Code steht nirgends in
// der Datei – er ergibt sich aus Reihe und Regeln, kann ihnen also nie widersprechen.
import { duplicates, type Glyph, GLYPHS, MIN_ATTEMPTS } from './tiles.ts';

export type CodeRule =
  /** Das n-te Symbol von links (ab 1). */
  | { pick: 'place'; n: number }
  /** Das n-te Symbol von rechts (ab 1). */
  | { pick: 'from-end'; n: number }
  | { pick: 'left-of'; of: Glyph }
  | { pick: 'right-of'; of: Glyph }
  /** Das eine Symbol, das zwischen den beiden steht. */
  | { pick: 'between'; a: Glyph; b: Glyph };

export interface SplitCodeData {
  /** Die Reihe, wie Rolle 2 sie sieht. */
  row: Glyph[];
  /** Eine Regel je Stelle des Codes, wie Rolle 1 sie sieht. */
  code: CodeRule[];
}

export type SplitCodeAttempt = Glyph[];

/** Das Symbol, auf das die Regel zeigt; null, wenn sie in dieser Reihe auf nichts zeigt. */
export function resolveRule(row: Glyph[], rule: CodeRule): Glyph | null {
  switch (rule.pick) {
    case 'place':
      return row[rule.n - 1] ?? null;
    case 'from-end':
      return row[row.length - rule.n] ?? null;
    case 'left-of': {
      const i = row.indexOf(rule.of);
      return i > 0 ? (row[i - 1] ?? null) : null;
    }
    case 'right-of': {
      const i = row.indexOf(rule.of);
      return i >= 0 ? (row[i + 1] ?? null) : null;
    }
    case 'between': {
      const i = row.indexOf(rule.a);
      const j = row.indexOf(rule.b);
      return i >= 0 && j >= 0 && Math.abs(i - j) === 2 ? (row[(i + j) / 2] ?? null) : null;
    }
  }
}

/** Die Auswahl am Schloss: alle Symbole der Reihe, aber in der festen Reihenfolge des Zeichenvorrats. */
export function palette(data: SplitCodeData): Glyph[] {
  return GLYPHS.filter((glyph) => data.row.includes(glyph));
}

export function validate(data: SplitCodeData): string[] {
  const problems: string[] = [];
  for (const dup of duplicates(data.row, (g) => g)) problems.push(`row: "${dup}" steht doppelt in der Reihe`);
  data.code.forEach((rule, index) => {
    if (resolveRule(data.row, rule) === null) problems.push(`code.${index}: die Regel zeigt in dieser Reihe auf kein Symbol`);
  });
  // Das Schloss zeigt die Symbole in der Reihenfolge des Zeichenvorrats. Stünde die Reihe genauso da,
  // könnte Rolle 1 sie erraten, ohne zu fragen.
  if (palette(data).join() === data.row.join()) problems.push('row: steht in der Reihenfolge des Zeichenvorrats – ohne Partner lösbar');
  const possible = codes(data);
  if (possible < MIN_ATTEMPTS) problems.push(`code: die Regeln lassen nur ${possible} Codes zu – mindestens ${MIN_ATTEMPTS}, sonst genügt Probieren`);
  return problems;
}

/**
 * Wie viele Codes Rolle 1 durchprobieren müsste: An jeder Stelle kommt jedes Symbol des Schlosses in Frage –
 * außer denen, die die Regel selbst nennt ("links vom Mond" ist nie der Mond).
 */
function codes(data: SplitCodeData): number {
  const symbols = palette(data).length;
  const named = (rule: CodeRule) => (rule.pick === 'between' ? new Set([rule.a, rule.b]).size : rule.pick === 'left-of' || rule.pick === 'right-of' ? 1 : 0);
  return data.code.reduce((count, rule) => count * Math.max(symbols - named(rule), 0), 1);
}

export function solution(data: SplitCodeData): SplitCodeAttempt {
  return data.code.map((rule) => {
    const glyph = resolveRule(data.row, rule);
    if (glyph === null) throw new Error('Regel ohne Ergebnis');
    return glyph;
  });
}

export function isSolved(data: SplitCodeData, attempt: SplitCodeAttempt): boolean {
  return attempt.join() === solution(data).join();
}
