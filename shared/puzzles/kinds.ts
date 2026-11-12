// Die sechs Rätselarten und wer in jeder die Lösung eingibt. Ohne weitere Importe, damit auch der Worker
// diese Datei bündeln kann, ohne die Logik der einzelnen Arten mitzunehmen.
//
// Jede Art hat zwei Rollen. `lead` (aus der Inhaltsdatei) übernimmt Rolle 1, der andere Rolle 2:
//   map-legend        1 sieht den Grundriss und tippt das Versteck an   · 2 hat Legende und Hinweise
//   split-code        1 hat das Schloss und die Regeln                  · 2 sieht die Symbolreihe
//   describe-arrange  1 sieht das Zielbild und beschreibt es            · 2 legt die Teile
//   spot-difference   beide sehen je eine Fassung und markieren die Unterschiede
//   sequence          1 hat die Schritte und ordnet sie                 · 2 hat die Hinweise zur Abfolge
//   blind-maze        1 sieht das Labyrinth und sagt den Weg an         · 2 steuert blind

export const PUZZLE_KINDS = ['map-legend', 'split-code', 'describe-arrange', 'spot-difference', 'sequence', 'blind-maze'] as const;
export type PuzzleKind = (typeof PUZZLE_KINDS)[number];

/** Rolle in einem Rätsel: `lead` ist der in der Inhaltsdatei genannte Spieler, `partner` der andere. */
export type PuzzleRole = 'lead' | 'partner';

/** Wer die Lösung eingibt – auf dessen Gerät wird sie geprüft, und nur er darf das Rätsel abschließen. */
export const SOLVER: Record<PuzzleKind, PuzzleRole | 'both'> = {
  'map-legend': 'lead',
  'split-code': 'lead',
  'describe-arrange': 'partner',
  'spot-difference': 'both',
  sequence: 'lead',
  'blind-maze': 'partner',
};

export function canSolve(kind: PuzzleKind, role: PuzzleRole): boolean {
  return SOLVER[kind] === 'both' || SOLVER[kind] === role;
}
