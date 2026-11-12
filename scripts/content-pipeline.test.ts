// Eine neue Rätselvariante braucht nur eine Inhaltsdatei (und ihren Platz in der Reihenfolge des Kapitels):
// Der Bau nimmt sie auf, die Regeln spielen sie, die Logik der Art löst sie – ohne dass Code angefasst wird.
// Und eine Variante, die sich widerspricht, kommt gar nicht erst ins Bündel.
import { execFileSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { stepsToFinish } from '../shared/autoplay.ts';
import type { RulesContent } from '../shared/content-schema.ts';
import { PUZZLE_LOGIC, type PuzzleLogic } from '../shared/puzzles/index.ts';
import { advance, applyAction, createHouse, joinHouse, type RuleContext } from '../shared/rules.ts';
import { nextDay } from '../shared/time.ts';

let dir: string;

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'paartrip-content-'));
});
afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});

/** Kopie der echten Inhalte mit einer zusätzlichen Aufgabe am Ende von Kapitel 1; baut sie und liefert das Ergebnis. */
function buildWith(name: string, task: Record<string, unknown>): { ok: boolean; output: string; content: RulesContent | null } {
  const source = join(dir, name, 'content');
  const out = join(dir, name, 'generated');
  cpSync('content', source, { recursive: true });
  writeFileSync(join(source, 'chapter-1', 'tasks', `${String(task.id)}.json`), JSON.stringify(task, null, 2));
  const chapterPath = join(source, 'chapter-1', 'chapter.json');
  const chapter = JSON.parse(readFileSync(chapterPath, 'utf8')) as { taskOrder: string[] };
  chapter.taskOrder.push(String(task.id));
  writeFileSync(chapterPath, JSON.stringify(chapter, null, 2));
  try {
    const output = execFileSync(process.execPath, ['scripts/build-content.ts', source, out], { encoding: 'utf8', stdio: 'pipe' });
    return { ok: true, output, content: JSON.parse(readFileSync(join(out, 'content-rules.json'), 'utf8')) as RulesContent };
  } catch (error) {
    const failed = error as { stdout?: string; stderr?: string };
    return { ok: false, output: `${failed.stdout ?? ''}${failed.stderr ?? ''}`, content: null };
  }
}

const variant = {
  id: 'extra-blind-maze-2',
  type: 'puzzle',
  kind: 'blind-maze',
  variant: 2,
  title: 'The cellar stairs',
  lead: 'a',
  data: { maze: ['..#G', '.##.', '....', 'S.#.'] },
};

describe('neue Rätselvariante als Inhaltsdatei', () => {
  it('wird ohne Codeänderung aufgenommen und ist bis zur Lösung spielbar', () => {
    const built = buildWith('good', variant);
    expect(built.output).toContain('Inhalte geprüft');
    expect(built.ok).toBe(true);
    const content = built.content!;
    const chapter = content.chapters[0]!;
    const task = chapter.tasks.at(-1)!;
    expect(task).toMatchObject({ id: variant.id, kind: 'blind-maze', variant: 2 });
    if (task.type !== 'puzzle') throw new Error('Rätsel erwartet');

    // Die Logik der Art löst die neue Variante …
    const logic = PUZZLE_LOGIC[task.kind] as PuzzleLogic<unknown, unknown>;
    expect(logic.isSolved(task.data, logic.solution(task.data))).toBe(true);

    // … und im Tagesablauf kommt sie an die Reihe und lässt sich von beiden abschließen.
    let day = '2027-01-11';
    const at = (): RuleContext => ({ content, now: `${day}T11:00:00.000Z` });
    let state = joinHouse(createHouse('house-1', 'Ada', at()), 'Bao', at())!;
    let n = 0;
    while (state.task?.taskId !== variant.id || state.task.completedAt === null) {
      const steps = stepsToFinish(state.task, chapter);
      expect(steps.length, `Aufgabe ${state.task?.taskId} hat keinen nächsten Schritt`).toBeGreaterThan(0);
      for (const step of steps) {
        const applied = applyAction(state, step.slot, { ...step.action, id: `pipeline-action-${++n}`, at: at().now }, at());
        expect(applied.result).toMatchObject({ outcome: 'applied' });
        state = applied.state;
      }
      if (state.task?.taskId === variant.id && state.task.completedAt !== null) break;
      day = nextDay(day);
      state = advance(state, at());
    }
    expect(state.done.at(-1)).toMatchObject({ taskId: variant.id, progress: { type: 'puzzle', solvedBy: 'b' } });
  });

  it('eine Variante, die sich nicht lösen lässt, bricht den Bau ab und nennt den Grund', () => {
    const built = buildWith('broken', { ...variant, id: 'extra-no-way', data: { maze: ['..#G', '.###', '....', 'S.#.'] } });
    expect(built.ok).toBe(false);
    expect(built.output).toContain('extra-no-way.json');
    expect(built.output).toContain('kein Weg');
  });

  it('eine Variante, die sich ohne Partner lösen ließe, bricht den Bau ebenfalls ab', () => {
    const built = buildWith('alone', { ...variant, id: 'extra-straight', data: { maze: ['...G', '.##.', '.##.', 'S...'] } });
    expect(built.ok).toBe(false);
    expect(built.output).toContain('ohne Partner lösbar');
  });
});
