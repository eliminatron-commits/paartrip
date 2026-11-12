// Der gemeinsame Zeichenvorrat der Rätsel. Die Zeichnungen dazu liegen in der App
// (src/components/Glyph.svelte); Inhalte nennen nur die Namen. Ein Symbol unterscheidet sich vom anderen
// allein durch seine Form – Farbe ist Schmuck und trägt keine Information, damit am Telefon niemand
// zwei ähnliche Farbtöne auseinanderhalten muss.

export const GLYPHS = [
  'sun',
  'moon',
  'star',
  'leaf',
  'wave',
  'heart',
  'drop',
  'cloud',
  'flower',
  'fish',
  'key',
  'bell',
  'house',
  'tree',
  'cup',
  'boat',
] as const;
export type Glyph = (typeof GLYPHS)[number];

/**
 * So viele verschiedene Eingaben muss ein Rätsel mindestens zulassen. Fehlversuche sind unbegrenzt und ohne
 * Folgen – bei weniger Möglichkeiten wäre Durchprobieren bequemer, als den Partner zu fragen.
 */
export const MIN_ATTEMPTS = 50;

export function duplicates<T>(values: T[], key: (value: T) => string): string[] {
  const keys = values.map(key);
  return [...new Set(keys.filter((k, i) => keys.indexOf(k) !== i))];
}
