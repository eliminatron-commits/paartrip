// Kapitel 1, wie es im Repo liegt: der verlangte Umfang und die Verteilung der Rollen.
// Was jedes Kapitel einhalten muss, prüft checkComplete (content-schema.ts); hier stehen die Zahlen dieses einen.
import { describe, expect, it } from 'vitest';
import generated from '../generated/content.json';
import { checkComplete, checkContent, contentSchema, PUZZLE_KINDS } from './content-schema.ts';

const content = contentSchema.parse(generated);
const chapter = content.chapters.find((c) => c.number === 1)!;
const count = <T>(items: T[], is: (item: T) => boolean) => items.filter(is).length;

describe('Kapitel 1: Umfang', () => {
  it('besteht Bezugs- und Vollständigkeitsprüfung', () => {
    expect(checkContent(content)).toEqual([]);
    expect(checkComplete(content)).toEqual([]);
  });

  it('30 Aufgaben: 12 Rätsel, 10 Kennst-du-mich-Fragen, 8 Aufgaben im echten Leben', () => {
    expect(chapter.tasks).toHaveLength(30);
    expect(count(chapter.tasks, (t) => t.type === 'puzzle')).toBe(12);
    expect(count(chapter.tasks, (t) => t.type === 'knowme')).toBe(10);
    expect(count(chapter.tasks, (t) => t.type === 'reallife')).toBe(8);
  });

  it('die Reihenfolge ist gemischt: nie zweimal hintereinander dieselbe Art von Aufgabe', () => {
    const repeats = chapter.tasks.filter((task, i) => i > 0 && task.type === chapter.tasks[i - 1]!.type).map((task) => task.id);
    expect(repeats).toEqual([]);
  });

  it('Meilensteine nach 5, 10, 15, 20, 25 und 30 Aufgaben, je mit einer Szene; die festen Gutscheine an 10, 20 und 30', () => {
    expect(chapter.milestones).toEqual([5, 10, 15, 20, 25, 30]);
    expect(chapter.story.map((s) => s.milestone).sort((x, y) => x - y)).toEqual(chapter.milestones);
    expect(chapter.coupons.map((c) => [c.milestone, c.from, c.to])).toEqual([
      [10, 'a', 'b'],
      [20, 'a', 'b'],
      [30, 'a', 'b'],
    ]);
    // Wo kein fester Gutschein wartet, liegt ein Dekostück bereit.
    expect(chapter.pieces.flatMap((p) => (p.milestone === undefined ? [] : [p.milestone])).sort((x, y) => x - y)).toEqual([5, 15, 25]);
  });

  it('Küche, Wohnzimmer und Garten mit mindestens 30 Plätzen, rund 45 Stücke', () => {
    expect(chapter.rooms.map((r) => r.id).sort()).toEqual(['garden', 'kitchen', 'living-room']);
    const spots = chapter.rooms.flatMap((r) => r.spots);
    expect(spots.length).toBeGreaterThanOrEqual(30);
    expect(chapter.pieces.length).toBeGreaterThanOrEqual(43);
    expect(chapter.pieces.length).toBeLessThanOrEqual(47);
    // Jeder Bauzug und jedes Dekostück braucht einen Platz.
    expect(spots.length).toBeGreaterThanOrEqual(chapter.tasks.length + count(chapter.pieces, (p) => p.milestone !== undefined));
  });

  it('für jede Platzart gibt es mehr Stücke als Plätze – so bleibt bis zum letzten Bauzug etwas zu wählen', () => {
    const spots = chapter.rooms.flatMap((r) => r.spots);
    for (const kind of new Set(spots.map((s) => s.kind))) {
      const places = count(spots, (s) => s.kind === kind);
      const fitting = count(chapter.pieces, (p) => p.milestone === undefined && p.fits.includes(kind));
      expect(fitting, `Stücke für "${kind}" (${places} Plätze)`).toBeGreaterThan(places);
    }
  });

  it('rund ein Viertel der Stücke trägt einen vietnamesischen Zweitnamen', () => {
    const share = count(chapter.pieces, (p) => p.nameVi !== undefined) / chapter.pieces.length;
    expect(share).toBeGreaterThanOrEqual(0.2);
    expect(share).toBeLessThanOrEqual(0.33);
  });
});

describe('Kapitel 1: Rätsel', () => {
  const puzzles = chapter.tasks.filter((t) => t.type === 'puzzle');

  it.each(PUZZLE_KINDS)('%s: zwei Varianten, die zweite kommt später und tauscht die Rollen', (kind) => {
    const variants = puzzles.filter((p) => p.kind === kind);
    expect(variants.map((p) => p.variant)).toEqual([1, 2]);
    expect(variants[0]!.lead).not.toBe(variants[1]!.lead);
  });

  it('beide führen gleich oft', () => {
    expect(count(puzzles, (p) => p.lead === 'a')).toBe(count(puzzles, (p) => p.lead === 'b'));
  });

  it('Variante 2 ist die größere: mehr Felder, Schritte, Regeln oder Verstecke', () => {
    const size = (task: (typeof puzzles)[number]): number => {
      switch (task.kind) {
        case 'map-legend':
          return task.data.treasures.length;
        case 'split-code':
          return task.data.code.length;
        case 'describe-arrange':
        case 'spot-difference':
          return task.data.cols * task.data.rows;
        case 'sequence':
          return task.data.steps.length;
        case 'blind-maze':
          return task.data.maze.length * task.data.maze[0]!.length;
      }
    };
    for (const kind of PUZZLE_KINDS) {
      const [first, second] = puzzles.filter((p) => p.kind === kind);
      expect(size(second!), kind).toBeGreaterThan(size(first!));
    }
  });
});

describe('Kapitel 1: Aufgaben im echten Leben', () => {
  const tasks = chapter.tasks.filter((t) => t.type === 'reallife');

  it('richten sich abwechselnd an einen oder an beide, und an jeden gleich oft allein', () => {
    const single = tasks.map((t) => t.doer !== 'both');
    expect(single.filter((s, i) => i > 0 && s === single[i - 1])).toEqual([]);
    expect(count(tasks, (t) => t.doer === 'a')).toBe(count(tasks, (t) => t.doer === 'b'));
  });
});

describe('Kapitel 1: Kennst-du-mich', () => {
  const questions = chapter.tasks.filter((t) => t.type === 'knowme');

  it('mischt Auswahl und kurze freie Antworten', () => {
    expect(count(questions, (q) => q.answer.kind === 'choice')).toBeGreaterThanOrEqual(3);
    expect(count(questions, (q) => q.answer.kind === 'text')).toBeGreaterThanOrEqual(3);
  });
});

describe('Vietnamesische Begriffe', () => {
  const words = (s: string): string[] => s.normalize('NFC').toLowerCase().match(/[\p{L}\p{M}]+/gu) ?? [];
  const terms = content.viTerms;

  it('jeder Zweitname und Kapiteltitel steht in der Liste, mit Bedeutung und Fundstelle', () => {
    const used = [chapter.titleVi, ...chapter.pieces.flatMap((p) => (p.nameVi ? [p.nameVi] : []))];
    expect(used.filter((term) => !terms.some((t) => t.term === term))).toEqual([]);
    for (const term of terms) {
      expect(term.meaning.length, term.term).toBeGreaterThan(0);
      expect(term.where.length, term.term).toBeGreaterThan(0);
    }
  });

  it('jede Fundstelle einer Inhaltsdatei nennt eine Datei, in der der Begriff wirklich vorkommt', () => {
    const texts = new Map<string, string>();
    for (const piece of chapter.pieces) texts.set(`content/chapter-1/pieces/${piece.id}.json`, `${piece.name} ${piece.nameVi ?? ''}`);
    for (const task of chapter.tasks) texts.set(`content/chapter-1/tasks/${task.id}.json`, JSON.stringify(task));
    for (const scene of chapter.story) texts.set(`content/chapter-1/story/${scene.id}.json`, `${scene.title} ${scene.text}`);
    texts.set('content/chapter-1/chapter.json', `${chapter.title} ${chapter.titleVi}`);
    for (const term of terms) {
      for (const where of term.where) {
        const file = where.split(':')[0]!;
        if (!file.startsWith('content/')) continue;
        const text = texts.get(file);
        expect(text, `${term.term}: ${file} gibt es nicht`).toBeDefined();
        // Mindestens ein Wort des Begriffs steht dort (in einer Szene heißt der Filter nur "the phin").
        expect(words(term.term).some((word) => words(text!).includes(word)), `${term.term} in ${file}`).toBe(true);
      }
    }
  });
});
