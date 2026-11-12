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
    for (const rule of rules) expect(splitCode.validate({ ...data, code: [rule] }), JSON.stringify(rule)).toHaveLength(1);
  });

  it('eine Reihe, die sich ohne Partner erraten ließe, fällt bei der Prüfung auf', () => {
    const guessable = splitCode.validate({ row: ['sun', 'moon', 'star', 'leaf'], code: [{ pick: 'place', n: 1 }] });
    expect(guessable.join()).toContain('ohne Partner lösbar');
    expect(splitCode.validate({ ...data, row: ['wave', 'moon', 'wave', 'sun', 'star'] }).join()).toContain('doppelt');
  });
});

describe('Karte und Legende', () => {
  const data: mapLegend.MapLegendData = {
    plan: ['#####', '#a1.#', '#2.3#', '#.4b#', '#####'],
    landmarks: [
      { key: 'a', glyph: 'sun', name: 'the stove' },
      { key: 'b', glyph: 'key', name: 'the door' },
    ],
    clues: ['Next to the door.', 'Not by the stove.'],
    treasure: '4',
  };

  it('nur das richtige Versteck gilt', () => {
    expect(mapLegend.validate(data)).toEqual([]);
    expect(mapLegend.isSolved(data, '4')).toBe(true);
    for (const other of ['1', '2', '3']) expect(mapLegend.isSolved(data, other)).toBe(false);
  });

  it('der Grundriss wird Feld für Feld gelesen', () => {
    expect(mapLegend.planCells(data)[1]).toEqual([{ kind: 'wall' }, { kind: 'landmark', key: 'a' }, { kind: 'spot', key: '1' }, { kind: 'floor' }, { kind: 'wall' }]);
  });

  it('Widersprüche zwischen Grundriss, Legende und Versteck fallen auf', () => {
    const problems = (change: Partial<mapLegend.MapLegendData>) => mapLegend.validate({ ...data, ...change }).join(' | ');
    expect(problems({ treasure: '9' })).toContain('Versteck "9" fehlt');
    expect(problems({ plan: ['#####', '#a1.#', '#2..#', '#.4b#', '#####'], treasure: '4' })).toContain('mindestens vier');
    expect(problems({ landmarks: data.landmarks.slice(0, 1) })).toContain('"b" fehlt in landmarks');
    expect(problems({ plan: ['#####', '#.1.#', '#2.3#', '#.4b#', '#####'] })).toContain('"a" fehlt im Grundriss');
    expect(problems({ plan: ['#####', '#a1.#', '#2.3#', '#.4b#', '####'] })).toContain('nicht gleich lang');
    expect(problems({ plan: ['#####', '#a1.#', '#2?3#', '#.4b#', '#####'] })).toContain('unbekanntes Zeichen');
    // Zwei Zeichen, die gleich aussehen, lassen sich am Telefon nicht unterscheiden.
    expect(problems({ landmarks: [data.landmarks[0]!, { ...data.landmarks[1]!, glyph: 'sun' }] })).toContain('sieht zweimal gleich aus');
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
});

describe('Zwei Bilder vergleichen', () => {
  const sun: Glyph = 'sun';
  const moon: Glyph = 'moon';
  const data: spotDifference.SpotDifferenceData = {
    cols: 3,
    rows: 2,
    scene: [sun, moon, null, sun, moon, null],
    changes: [
      { cell: 1, glyph: 'star' },
      { cell: 2, glyph: sun },
      { cell: 3, glyph: null },
    ],
  };

  it('jede Rolle sieht ihre eigene Fassung', () => {
    expect(spotDifference.validate(data)).toEqual([]);
    expect(spotDifference.versionFor(data, 'lead')).toEqual(data.scene);
    expect(spotDifference.versionFor(data, 'partner')).toEqual([sun, 'star', sun, null, moon, null]);
  });

  it('gelöst ist es mit genau den abweichenden Feldern, in beliebiger Reihenfolge', () => {
    expect(spotDifference.isSolved(data, [3, 1, 2])).toBe(true);
    expect(spotDifference.isSolved(data, [1, 2])).toBe(false);
    expect(spotDifference.isSolved(data, [1, 2, 3, 4])).toBe(false);
    // Alles zu markieren ist keine Lösung.
    expect(spotDifference.isSolved(data, [0, 1, 2, 3, 4, 5])).toBe(false);
  });

  it('ein Unterschied, der keiner ist, und zu viele Unterschiede fallen auf', () => {
    expect(spotDifference.validate({ ...data, changes: [...data.changes.slice(0, 2), { cell: 0, glyph: sun }] }).join()).toContain('sieht in beiden Fassungen gleich aus');
    expect(spotDifference.validate({ ...data, changes: [...data.changes, { cell: 4, glyph: null }] }).join()).toContain('höchstens die Hälfte');
    expect(spotDifference.validate({ ...data, changes: data.changes.slice(0, 1) }).join()).toContain('mindestens zwei');
    expect(spotDifference.validate({ ...data, changes: [...data.changes.slice(0, 2), { cell: 9, glyph: null }] }).join()).toContain('gibt es nicht');
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
    expect(sequence.validate({ ...data, steps: ['One', 'Two', 'one ', 'Four'] })).toHaveLength(1);
  });
});

describe('Wegweiser', () => {
  const data: blindMaze.BlindMazeData = { maze: ['S.#.', '#.#.', '#...', '###G'] };

  it('der kürzeste Weg führt ans Ziel, ohne eine Wand zu berühren', () => {
    expect(blindMaze.validate(data)).toEqual([]);
    const route = blindMaze.solution(data);
    expect(route).toEqual(['right', 'down', 'down', 'right', 'right', 'down']);
    expect(blindMaze.isSolved(data, route)).toBe(true);
  });

  it('wer durch eine Wand geht, kommt an – aber gelöst ist es nicht', () => {
    const through: blindMaze.Move[] = ['right', 'right', 'right', 'down', 'down', 'down'];
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
});
