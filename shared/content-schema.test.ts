import { describe, expect, it } from 'vitest';
import generated from '../generated/content.json';
import {
  checkContent,
  type Content,
  contentSchema,
  fixedCouponSchema,
  parseSvg,
  pieceFileSchema,
  storySceneSchema,
  taskSchema,
} from './content-schema.ts';

const words = (n: number) => Array.from({ length: n }, (_, i) => `word${i}`).join(' ');

/** Kleines, in sich stimmiges Kapitel als Ausgangspunkt für die Bezugsprüfungen. */
function sample(): Content {
  const art = { viewBox: '0 0 10 10', body: '<rect width="10" height="10"/>' };
  return {
    chapters: [
      {
        number: 1,
        title: 'One',
        titleVi: 'Một',
        taskOrder: ['t1'],
        milestones: [1, 2],
        build: { offerSize: 3, firstChooser: 'a' },
        rooms: [{ id: 'room', name: 'Room', art, spots: [{ id: 'room-1', kind: 'floor', x: 1, y: 2, size: 3 }] }],
        tasks: [{ id: 't1', type: 'reallife', title: 'T', text: 'Do it.', doer: 'both' }],
        story: [{ id: 's1', milestone: 1, title: 'S', text: words(60) }],
        pieces: [{ id: 'chair', name: 'Chair', nameVi: 'Ghế', fits: ['floor'], art }],
        coupons: [{ id: 'c1', milestone: 2, from: 'a', to: 'b', text: 'Tea' }],
      },
    ],
    viTerms: [
      { term: 'Một', meaning: 'one', where: ['chapter-1/chapter.json'] },
      { term: 'Ghế', meaning: 'chair', where: ['chapter-1/pieces/chair.json'] },
    ],
  };
}

describe('Inhaltsdateien im Repo', () => {
  it('das gebaute Bündel besteht Schema und Bezugsprüfung', () => {
    const content = contentSchema.parse(generated);
    expect(checkContent(content)).toEqual([]);
  });
});

describe('Aufgaben-Schema', () => {
  const puzzle = {
    id: 'lock',
    type: 'puzzle',
    kind: 'split-code',
    variant: 1,
    title: 'Lock',
    lead: 'a',
    data: {
      row: ['leaf', 'sun', 'star', 'moon'],
      code: [
        { pick: 'place', n: 1 },
        { pick: 'left-of', of: 'star' },
        { pick: 'from-end', n: 1 },
      ],
    },
  };

  it('nimmt die drei Aufgabentypen an', () => {
    expect(taskSchema.safeParse(puzzle).success).toBe(true);
    expect(
      taskSchema.safeParse({ id: 'q', type: 'knowme', question: 'Tea or coffee?', answer: { kind: 'choice', options: ['Tea', 'Coffee'] } })
        .success,
    ).toBe(true);
    expect(taskSchema.safeParse({ id: 'r', type: 'reallife', title: 'T', text: 'Call.', doer: 'a' }).success).toBe(true);
  });

  it('lehnt ein unbekanntes Symbol ab', () => {
    const broken = { ...puzzle, data: { ...puzzle.data, row: ['leaf', 'sun', 'star', 'comet'] } };
    expect(taskSchema.safeParse(broken).success).toBe(false);
  });

  it('lehnt Rätseldaten ab, die sich widersprechen, und nennt den Grund', () => {
    // Links vom ersten Symbol der Reihe steht nichts: Die Regel zeigt ins Leere.
    const broken = { ...puzzle, data: { ...puzzle.data, code: [...puzzle.data.code, { pick: 'left-of', of: 'leaf' }] } };
    const result = taskSchema.safeParse(broken);
    expect(result.success).toBe(false);
    expect(JSON.stringify(result.error?.issues)).toContain('zeigt in dieser Reihe auf kein Symbol');
  });

  it('lehnt ein Rätsel ab, das sich ohne Partner lösen ließe', () => {
    // Die Reihe steht so da, wie das Schloss die Symbole ohnehin zeigt.
    const guessable = { ...puzzle, data: { ...puzzle.data, row: ['sun', 'moon', 'star', 'leaf'] } };
    const result = taskSchema.safeParse(guessable);
    expect(result.success).toBe(false);
    expect(JSON.stringify(result.error?.issues)).toContain('ohne Partner lösbar');
  });

  it('lehnt unbekannte Felder und Typen ab', () => {
    expect(taskSchema.safeParse({ ...puzzle, extra: true }).success).toBe(false);
    expect(taskSchema.safeParse({ id: 'x', type: 'quiz' }).success).toBe(false);
    expect(taskSchema.safeParse({ id: 'Not An Id', type: 'reallife', title: 'T', text: 'x', doer: 'a' }).success).toBe(false);
  });

  it('lehnt Daten ab, die nicht zur Rätselart passen', () => {
    expect(taskSchema.safeParse({ ...puzzle, kind: 'blind-maze' }).success).toBe(false);
  });
});

describe('weitere Schemata', () => {
  it('Story-Szenen brauchen 60–100 Wörter', () => {
    const scene = (n: number) => storySceneSchema.safeParse({ id: 's', milestone: 5, title: 'T', text: words(n) }).success;
    expect(scene(59)).toBe(false);
    expect(scene(60)).toBe(true);
    expect(scene(100)).toBe(true);
    expect(scene(101)).toBe(false);
  });

  it('ein Gutschein geht immer an den anderen', () => {
    expect(fixedCouponSchema.safeParse({ id: 'c', milestone: 10, from: 'a', to: 'a', text: 'x' }).success).toBe(false);
    expect(fixedCouponSchema.safeParse({ id: 'c', milestone: 10, from: 'a', to: 'b', text: 'x' }).success).toBe(true);
  });

  it('ein Stück muss auf mindestens eine Platzart passen', () => {
    expect(pieceFileSchema.safeParse({ id: 'p', name: 'P', fits: [] }).success).toBe(false);
  });
});

describe('parseSvg', () => {
  it('liefert viewBox und Inhalt', () => {
    expect(parseSvg('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 4 4">\n  <rect width="4" height="4"/>\n</svg>\n')).toEqual({
      viewBox: '0 0 4 4',
      body: '<rect width="4" height="4"/>',
    });
  });

  it('verlangt viewBox und Inhalt', () => {
    expect(parseSvg('<svg xmlns="http://www.w3.org/2000/svg"><rect/></svg>')).toBeTypeOf('string');
    expect(parseSvg('<svg viewBox="0 0 4 4"></svg>')).toBeTypeOf('string');
    expect(parseSvg('<div>no</div>')).toBeTypeOf('string');
  });

  it('lehnt Skripte, externe Verweise und Rasterbilder ab', () => {
    const wrap = (body: string) => parseSvg(`<svg viewBox="0 0 4 4">${body}</svg>`);
    expect(wrap('<script>alert(1)</script>')).toBeTypeOf('string');
    expect(wrap('<rect onclick="x()"/>')).toBeTypeOf('string');
    expect(wrap('<image href="a.png"/>')).toBeTypeOf('string');
    expect(wrap('<use href="https://example.com/a.svg#x"/>')).toBeTypeOf('string');
    expect(wrap('<rect width="4" height="4"/>')).toBeTypeOf('object');
  });
});

describe('checkContent', () => {
  it('findet im stimmigen Beispiel nichts', () => {
    expect(checkContent(contentSchema.parse(sample()))).toEqual([]);
  });

  it('meldet vietnamesische Begriffe, die in vi-terms.json fehlen', () => {
    const content = sample();
    content.viTerms = [];
    const problems = checkContent(content);
    expect(problems).toHaveLength(2);
    expect(problems.join('\n')).toContain('"Một"');
    expect(problems.join('\n')).toContain('"Ghế"');
  });

  it('meldet Verweise auf unbekannte Meilensteine', () => {
    const content = sample();
    content.chapters[0]!.story[0]!.milestone = 7;
    content.chapters[0]!.coupons[0]!.milestone = 9;
    content.chapters[0]!.pieces[0]!.milestone = 3;
    expect(checkContent(content)).toHaveLength(3);
  });

  it('meldet doppelte Aufgaben und Plätze sowie ungeordnete Meilensteine', () => {
    const content = sample();
    const chapter = content.chapters[0]!;
    chapter.taskOrder = ['t1', 't1'];
    chapter.rooms[0]!.spots.push({ id: 'room-1', kind: 'floor', x: 5, y: 5, size: 3 });
    chapter.milestones = [2, 1];
    expect(checkContent(content)).toHaveLength(3);
  });

  it('meldet Stücke, die auf keinen vorhandenen Platz passen', () => {
    const content = sample();
    content.chapters[0]!.pieces[0]!.fits = ['ceiling'];
    expect(checkContent(content)).toEqual([expect.stringContaining('passt auf keinen Platz')]);
  });
});
