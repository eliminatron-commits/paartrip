// Die Logik der sechs Rätselarten: Jede Variante der Inhalte ist lösbar, ein falscher Versuch gilt nicht,
// und die Prüfung der Daten erkennt, was ein Rätsel widersprüchlich oder ohne Partner lösbar machte.
import { describe, expect, it } from 'vitest';
import generated from '../../generated/content-rules.json';
import type { RulesContent } from '../content-schema.ts';
import * as blindMaze from './blind-maze.ts';
import * as describeArrange from './describe-arrange.ts';
import { PUZZLE_LOGIC, type PuzzleLogic } from './index.ts';
import { PUZZLE_KINDS } from './kinds.ts';
import * as mapLegend from './map-legend.ts';
import * as sequence from './sequence.ts';
import * as splitCode from './split-code.ts';
import * as spotDifference from './spot-difference.ts';
import type { Glyph } from './tiles.ts';

const content = generated as unknown as RulesContent;
const puzzles = content.chapters.flatMap((chapter) => chapter.tasks.filter((task) => task.type === 'puzzle'));

describe('Rätsel der Inhalte', () => {
  it('jede Rätselart hat mindestens eine Variante', () => {
    expect([...new Set(puzzles.map((p) => p.kind))].sort()).toEqual([...PUZZLE_KINDS].sort());
  });

  it.each(puzzles.map((p) => [p.id, p] as const))('%s: die Daten stimmen, und die Lösung löst es', (_id, puzzle) => {
    const logic = PUZZLE_LOGIC[puzzle.kind] as PuzzleLogic<unknown, unknown>;
    expect(logic.validate(puzzle.data)).toEqual([]);
    expect(logic.isSolved(puzzle.data, logic.solution(puzzle.data))).toBe(true);
  });
});

describe('Geteilter Code', () => {
  const data: splitCode.SplitCodeData = {
    row: ['wave', 'moon', 'leaf', 'sun', 'star'],
    code: [{ pick: 'place', n: 2 }, { pick: 'from-end', n: 2 }, { pick: 'left-of', of: 'leaf' }, { pick: 'right-of', of: 'leaf' }, { pick: 'between', a: 'star', b: 'leaf' }],
  };

  it('jede Regel zeigt auf genau ein Symbol der Reihe', () => {
    expect(splitCode.validate(data)).toEqual([]);
    expect(splitCode.solution(data)).toEqual(['moon', 'sun', 'moon', 'sun', 'sun']);
  });

  it('nur der ganze Code in der richtigen Reihenfolge öffnet das Schloss', () => {
    expect(splitCode.isSolved(data, ['moon', 'sun', 'moon', 'sun', 'sun'])).toBe(true);
    expect(splitCode.isSolved(data, ['sun', 'moon', 'moon', 'sun', 'sun'])).toBe(false);
    expect(splitCode.isSolved(data, ['moon', 'sun', 'moon', 'sun'])).toBe(false);
    expect(splitCode.isSolved(data, [])).toBe(false);
  });

  it('das Schloss zeigt die Symbole nicht in der Reihenfolge der Reihe', () => {
    expect([...splitCode.palette(data)].sort()).toEqual([...data.row].sort());
    expect(splitCode.palette(data)).not.toEqual(data.row);
  });

  it('eine Regel, die ins Leere zeigt, fällt bei der Prüfung auf', () => {
    const rules: splitCode.CodeRule[] = [
      { pick: 'place', n: 6 },
      { pick: 'left-of', of: 'wave' },
      { pick: 'right-of', of: 'star' },
      { pick: 'left-of', of: 'heart' },
      { pick: 'between', a: 'wave', b: 'sun' },
    ];
    for (const rule of rules) expect(splitCode.validate({ ...data, code: [...data.code, rule] }), JSON.stringify(rule)).toHaveLength(1);
  });

  it('eine Reihe, die sich ohne Partner erraten ließe, fällt bei der Prüfung auf', () => {
    const guessable = splitCode.validate({ row: ['sun', 'moon', 'star', 'leaf'], code: [{ pick: 'place', n: 1 }] });
    expect(guessable.join()).toContain('ohne Partner lösbar');
    expect(splitCode.validate({ ...data, row: ['wave', 'moon', 'wave', 'sun', 'star'] }).join()).toContain('doppelt');
  });

  it('Regeln, die so wenige Codes zulassen, dass Durchprobieren genügt, fallen auf', () => {
    // Vier Symbole; "zwischen" schließt zwei davon aus, "links von" und "rechts von" je eines: 2 · 3 · 3 Codes.
    const few: splitCode.SplitCodeData = {
      row: ['wave', 'moon', 'leaf', 'sun'],
      code: [{ pick: 'between', a: 'wave', b: 'leaf' }, { pick: 'left-of', of: 'leaf' }, { pick: 'right-of', of: 'leaf' }],
    };
    expect(splitCode.validate(few).join()).toContain('nur 18 Codes');
    // Eine vierte Stelle macht daraus 72.
    expect(splitCode.validate({ ...few, code: [...few.code, { pick: 'place', n: 1 }] })).toEqual([]);
  });
});

describe('Karte und Legende', () => {
  const data: mapLegend.MapLegendData = {
    plan: ['######', '#a1.2#', '#3..4#', '#5..6#', '#7.8b#', '######'],
    landmarks: [
      { key: 'a', glyph: 'sun', name: 'the stove' },
      { key: 'b', glyph: 'wave', name: 'the door' },
    ],
    clues: ['One is next to the door.', 'Two are by the stove.'],
    treasures: ['8', '1', '3'],
  };

  it('nur die ganze Auswahl gilt: genau die richtigen Verstecke, in beliebiger Reihenfolge', () => {
    expect(mapLegend.validate(data)).toEqual([]);
    expect(mapLegend.solution(data)).toEqual(['1', '3', '8']);
    expect(mapLegend.isSolved(data, ['3', '8', '1'])).toBe(true);
    // Eines zu wenig, eines zu viel, eines daneben – und alles zu markieren ist auch keine Lösung.
    expect(mapLegend.isSolved(data, ['1', '3'])).toBe(false);
    expect(mapLegend.isSolved(data, ['1', '3', '8', '2'])).toBe(false);
    expect(mapLegend.isSolved(data, ['1', '3', '7'])).toBe(false);
    expect(mapLegend.isSolved(data, ['1', '2', '3', '4', '5', '6', '7', '8'])).toBe(false);
    expect(mapLegend.isSolved(data, [])).toBe(false);
    for (const single of ['1', '3', '8']) expect(mapLegend.isSolved(data, [single])).toBe(false);
  });

  it('der Grundriss wird Feld für Feld gelesen', () => {
    expect(mapLegend.planCells(data)[1]).toEqual([
      { kind: 'wall' },
      { kind: 'landmark', key: 'a' },
      { kind: 'spot', key: '1' },
      { kind: 'floor' },
      { kind: 'spot', key: '2' },
      { kind: 'wall' },
    ]);
  });

  it('Widersprüche zwischen Grundriss, Legende und Verstecken fallen auf', () => {
    const problems = (change: Partial<mapLegend.MapLegendData>) => mapLegend.validate({ ...data, ...change }).join(' | ');
    expect(problems({ treasures: ['1', '3', '9'] })).toContain('Versteck "9" fehlt');
    expect(problems({ treasures: ['1', '3', '3'] })).toContain('Versteck "3" doppelt');
    expect(problems({ landmarks: data.landmarks.slice(0, 1) })).toContain('"b" fehlt in landmarks');
    expect(problems({ plan: ['######', '#.1.2#', '#3..4#', '#5..6#', '#7.8b#', '######'] })).toContain('"a" fehlt im Grundriss');
    expect(problems({ plan: ['######', '#a1.2#', '#3..4#', '#5..6#', '#7.8b#', '#####'] })).toContain('nicht gleich lang');
    expect(problems({ plan: ['######', '#a1.2#', '#3?.4#', '#5..6#', '#7.8b#', '######'] })).toContain('unbekanntes Zeichen');
    // Zwei Zeichen, die gleich aussehen, lassen sich am Telefon nicht unterscheiden.
    expect(problems({ landmarks: [data.landmarks[0]!, { ...data.landmarks[1]!, glyph: 'sun' }] })).toContain('sieht zweimal gleich aus');
  });

  it('was sich ohne Partner lösen ließe, fällt auf: zu wenige Auswahlen und Zeichen, die ihre Bedeutung verraten', () => {
    const problems = (change: Partial<mapLegend.MapLegendData>) => mapLegend.validate({ ...data, ...change }).join(' | ');
    // Ein einzelnes Versteck unter acht wäre mit acht Versuchen gefunden, zwei unter acht mit 28.
    expect(problems({ treasures: ['8'] })).toContain('nur 8 Auswahlen');
    expect(problems({ treasures: ['8', '1'] })).toContain('nur 28 Auswahlen');
    // Drei unter sieben sind 35, drei unter acht 56.
    expect(problems({ plan: ['######', '#a1.2#', '#3..4#', '#5..6#', '#..8b#', '######'] })).toContain('nur 35 Auswahlen');
    expect(problems({})).toBe('');
    expect(problems({ landmarks: [data.landmarks[0]!, { key: 'b', glyph: 'key', name: 'The Key hook' }] })).toContain('verrät, wofür es steht');
  });
});

describe('Beschreiben und Anordnen', () => {
  const tiles: Glyph[] = ['sun', 'moon', 'leaf', 'star'];
  const data: describeArrange.DescribeArrangeData = { cols: 2, rows: 2, tiles, target: [0, null, 2, 1] };

  it('gelöst ist es nur, wenn jedes Feld stimmt – auch die leeren', () => {
    expect(describeArrange.validate(data)).toEqual([]);
    expect(describeArrange.isSolved(data, [0, null, 2, 1])).toBe(true);
    expect(describeArrange.isSolved(data, [0, 3, 2, 1])).toBe(false);
    expect(describeArrange.isSolved(data, [0, null, 1, 2])).toBe(false);
    expect(describeArrange.isSolved(data, [null, null, null, null])).toBe(false);
  });

  it('ein Zielbild, das nicht zum Raster oder Vorrat passt, fällt auf', () => {
    expect(describeArrange.validate({ ...data, target: [0, null, 2] }).join()).toContain('braucht 4 Felder');
    expect(describeArrange.validate({ ...data, target: [0, 0, 2, 1] }).join()).toContain('auf zwei Feldern');
    expect(describeArrange.validate({ ...data, target: [0, 7, 2, 1] }).join()).toContain('gibt es nicht');
    expect(describeArrange.validate({ ...data, tiles: [...tiles, tiles[0]!] }).join()).toContain('doppelt');
  });

  it('ein Regal, bei dem Durchprobieren genügt, fällt auf', () => {
    // Drei Teile, alle gebraucht, vier Felder: 4 · 3 · 2 Bilder. Mit einem vierten Teil als Ablenkung sind es 96.
    expect(describeArrange.validate({ ...data, tiles: tiles.slice(0, 3) }).join()).toContain('nur 24 Bilder');
    expect(describeArrange.validate(data)).toEqual([]);
  });
});

describe('Zwei Bilder vergleichen', () => {
  const sun: Glyph = 'sun';
  const moon: Glyph = 'moon';
  const data: spotDifference.SpotDifferenceData = {
    cols: 4,
    rows: 2,
    scene: [sun, moon, null, sun, moon, null, sun, moon],
    changes: [
      { cell: 1, glyph: 'star' },
      { cell: 2, glyph: sun },
      { cell: 3, glyph: null },
    ],
  };

  it('jede Rolle sieht ihre eigene Fassung', () => {
    expect(spotDifference.validate(data)).toEqual([]);
    expect(spotDifference.versionFor(data, 'lead')).toEqual(data.scene);
    expect(spotDifference.versionFor(data, 'partner')).toEqual([sun, 'star', sun, null, moon, null, sun, moon]);
  });

  it('gelöst ist es mit genau den abweichenden Feldern, in beliebiger Reihenfolge', () => {
    expect(spotDifference.isSolved(data, [3, 1, 2])).toBe(true);
    expect(spotDifference.isSolved(data, [1, 2])).toBe(false);
    expect(spotDifference.isSolved(data, [1, 2, 3, 4])).toBe(false);
    // Alles zu markieren ist keine Lösung.
    expect(spotDifference.isSolved(data, [0, 1, 2, 3, 4, 5, 6, 7])).toBe(false);
  });

  it('ein Unterschied, der keiner ist, und zu viele Unterschiede fallen auf', () => {
    expect(spotDifference.validate({ ...data, changes: [...data.changes.slice(0, 2), { cell: 0, glyph: sun }] }).join()).toContain('sieht in beiden Fassungen gleich aus');
    // Vier von acht Feldern sind gerade noch die Hälfte, fünf sind zu viele.
    const four = [...data.changes, { cell: 4, glyph: null }];
    expect(spotDifference.validate({ ...data, changes: four })).toEqual([]);
    expect(spotDifference.validate({ ...data, changes: [...four, { cell: 5, glyph: 'star' as Glyph }] }).join()).toContain('höchstens die Hälfte');
    expect(spotDifference.validate({ ...data, changes: data.changes.slice(0, 1) }).join()).toContain('mindestens zwei');
    expect(spotDifference.validate({ ...data, changes: [...data.changes.slice(0, 2), { cell: 9, glyph: null }] }).join()).toContain('gibt es nicht');
  });

  it('ein Regal mit so wenigen Feldern, dass Durchprobieren genügt, fällt auf', () => {
    // Sechs Felder mit zwei oder drei Unterschieden: 15 + 20 Markierungen. Bei acht Feldern sind es 154.
    const small: spotDifference.SpotDifferenceData = { cols: 3, rows: 2, scene: data.scene.slice(0, 6), changes: data.changes };
    expect(spotDifference.validate(small).join()).toContain('nur 35 Markierungen');
    expect(spotDifference.validate({ ...small, cols: 2, scene: data.scene.slice(0, 4), changes: data.changes.slice(0, 2) }).join()).toContain('nur 6 Markierungen');
  });
});

describe('Reihenfolge', () => {
  const data: sequence.SequenceData = { steps: ['One', 'Two', 'Three', 'Four', 'Five'], hints: ['One first.', 'Five last.'] };

  it('die Schritte liegen zu Beginn durcheinander, auf jedem Gerät gleich und nie schon richtig', () => {
    const order = sequence.startOrder(data);
    expect([...order].sort()).toEqual([0, 1, 2, 3, 4]);
    expect(sequence.startOrder(data)).toEqual(order);
    expect(sequence.isSolved(data, order)).toBe(false);
    // Auch bei Schritten, die anders gemischt werden.
    for (const steps of [['a', 'b', 'c', 'd'], ['x1', 'x2', 'x3', 'x4', 'x5', 'x6'], ['Wake up', 'Coffee', 'Shower', 'Leave']]) {
      expect(sequence.isSolved({ steps, hints: [] }, sequence.startOrder({ steps, hints: [] })), steps.join()).toBe(false);
    }
  });

  it('gelöst ist es nur in der richtigen Abfolge', () => {
    expect(sequence.isSolved(data, [0, 1, 2, 3, 4])).toBe(true);
    expect(sequence.isSolved(data, [0, 1, 3, 2, 4])).toBe(false);
    expect(sequence.isSolved(data, [0, 1, 2, 3])).toBe(false);
  });

  it('zwei gleichlautende Schritte fallen auf', () => {
    expect(sequence.validate(data)).toEqual([]);
    expect(sequence.validate({ ...data, steps: ['One', 'Two', 'one ', 'Four', 'Five'] }).join()).toContain('doppelt');
  });

  it('so wenige Schritte, dass Durchprobieren genügt, fallen auf', () => {
    // Vier Schritte haben 24 Reihenfolgen, fünf 120.
    expect(sequence.validate({ ...data, steps: data.steps.slice(0, 4) }).join()).toContain('nur 24 Reihenfolgen');
  });
});

describe('Wegweiser', () => {
  // Eine Treppe von links oben nach rechts unten.
  const data: blindMaze.BlindMazeData = { maze: ['S.###', '#..##', '##..#', '###..', '####G'] };

  it('der kürzeste Weg führt ans Ziel, ohne eine Wand zu berühren', () => {
    expect(blindMaze.validate(data)).toEqual([]);
    const route = blindMaze.solution(data);
    expect(route).toEqual(['right', 'down', 'right', 'down', 'right', 'down', 'right', 'down']);
    expect(blindMaze.isSolved(data, route)).toBe(true);
  });

  it('wer durch eine Wand geht, kommt an – aber gelöst ist es nicht', () => {
    const through: blindMaze.Move[] = ['right', 'right', 'right', 'right', 'down', 'down', 'down', 'down'];
    expect(blindMaze.walk(data, through)).toMatchObject({ atGoal: true, clean: false });
    expect(blindMaze.isSolved(data, through)).toBe(false);
    // Unterwegs anzuhalten ist auch keine Lösung.
    expect(blindMaze.isSolved(data, ['right', 'down'])).toBe(false);
  });

  it('Schritte über den Rand hinaus fallen weg', () => {
    const walked = blindMaze.walk(data, ['up', 'left', 'right']);
    expect(walked.path).toEqual([{ row: 0, col: 0 }, { row: 0, col: 1 }]);
  });

  it('ein Labyrinth ohne Weg oder mit freiem geradem Weg fällt auf', () => {
    expect(blindMaze.validate({ maze: ['S.#.', '###.', '#...', '###G'] }).join()).toContain('kein Weg');
    expect(blindMaze.validate({ maze: ['S...', '.##.', '.##.', '...G'] }).join()).toContain('ohne Partner lösbar');
    expect(blindMaze.validate({ maze: ['S.#.', '#.#.', '#...', '###.'] }).join()).toContain('genau ein "G"');
    expect(blindMaze.validate({ maze: ['S.#.', '#.#', '#...', '###G'] }).join()).toContain('nicht gleich lang');
  });

  it('ein Labyrinth, bei dem Durchprobieren genügt, fällt auf', () => {
    // Das Ziel liegt zwei Felder neben dem Start hinter einer Wand: Bis zur Länge des richtigen Wegs (sechs
    // Schritte) gibt es ohne Blick auf die Wände nur elf Wege dorthin.
    expect(blindMaze.validate({ maze: ['S#G.', '.#..', '....', '....'] }).join()).toContain('nur 11 Wege');
    // Auf vier mal vier Feldern von Ecke zu Ecke sind es zwanzig kürzeste Wege – auch das ist zu wenig.
    expect(blindMaze.validate({ maze: ['S.#.', '#.#.', '#...', '###G'] }).join()).toContain('nur 20 Wege');
  });
});
