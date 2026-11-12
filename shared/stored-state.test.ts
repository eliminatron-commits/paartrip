// Stände, die eine frühere Version gespeichert hat, müssen sich weiter abgleichen lassen.
import { describe, expect, it } from 'vitest';
import generated from '../generated/content-rules.json';
import type { RulesContent } from './content-schema.ts';
import type { HouseState } from './model.ts';
import { advance, createHouse, joinHouse, type RuleContext } from './rules.ts';
import { type StoredHouseState, upgradeState } from './stored-state.ts';
import { deriveView } from './view.ts';

const content = generated as unknown as RulesContent;
const chapter = content.chapters[0]!;
const ctx: RuleContext = { content, now: '2026-11-12T10:00:00.000Z' };
const question = chapter.tasks.find((t) => t.type === 'knowme' && t.answer.kind === 'choice')!;

const viewOf = (state: HouseState) => deriveView(state, 'a', { content, now: ctx.now, pairingCode: 'TESTCODE' });

/**
 * Ein Haus, wie Phase 3 es gespeichert hat: keine laufende Aufgabe, und die erledigte Frage aus dem
 * damaligen Test-Knopf ohne das Feld `judged`. Einmal durch JSON geschickt, wie es aus der Datenbank kommt.
 */
function fromPhase3(): StoredHouseState {
  const house = joinHouse(createHouse('house-1', 'Ada', ctx), 'Bao', ctx)!;
  const stored: StoredHouseState = {
    ...house,
    task: null,
    done: [
      {
        taskId: question.id,
        completedAt: ctx.now,
        progress: {
          type: 'knowme',
          submissions: {
            a: { own: { kind: 'choice', option: 0 }, guess: { kind: 'choice', option: 1 } },
            b: { own: { kind: 'choice', option: 1 }, guess: { kind: 'choice', option: 1 } },
          },
          hearts: ['a'],
        },
      },
    ],
  };
  return JSON.parse(JSON.stringify(stored)) as StoredHouseState;
}

describe('gespeicherte Stände früherer Versionen', () => {
  it('ein Stand aus Phase 3 ergibt eine Sicht – das fehlende Feld wird beim Laden ergänzt', () => {
    const stored = fromPhase3();
    // So, wie er gespeichert ist, scheitert die Sicht: Genau daran hinge sonst jeder Abgleich.
    expect(() => viewOf(stored as HouseState)).toThrow();

    const state = upgradeState(stored);
    expect(viewOf(state).done).toMatchObject([{ taskId: question.id, progress: { type: 'knowme', hearts: ['a'], judged: [] } }]);
  });

  it('danach geht es mit der ersten Aufgabe weiter, die das Haus noch nicht erledigt hat', () => {
    const state = advance(upgradeState(fromPhase3()), ctx);
    const next = chapter.tasks.find((t) => t.id !== question.id)!;
    expect(state.task).toMatchObject({ taskId: next.id, completedAt: null });
    expect(viewOf(state).task).toMatchObject({ taskId: next.id });
  });

  it('auch an der laufenden Aufgabe wird das Feld ergänzt', () => {
    const stored = fromPhase3();
    stored.task = { taskId: question.id, availableOn: '2026-11-12', completedAt: null, progress: { type: 'knowme', submissions: {}, hearts: [] } };
    expect(upgradeState(stored).task?.progress).toEqual({ type: 'knowme', submissions: {}, hearts: [], judged: [] });
  });

  it('ein Stand in heutiger Form bleibt, wie er ist', () => {
    const house = joinHouse(createHouse('house-1', 'Ada', ctx), 'Bao', ctx)!;
    expect(upgradeState(house)).toEqual(house);
  });
});
