// Die Schritte, mit denen zwei Spieler eine Aufgabe abschließen würden – für Tests und den lokalen
// Testserver, die schnell zu einem Bauzug oder Meilenstein kommen wollen. Es sind die echten Aktionen der
// Spieler; angewendet werden sie über die echten Regeln. Die App selbst nutzt das nicht.
import type { ActionBody } from './actions.ts';
import type { RulesChapter } from './content-schema.ts';
import { type ActiveTask, type KnowMeAnswer, otherSlot, type Slot } from './model.ts';
import { canSolve } from './puzzles/kinds.ts';
import { hasActed, receiversOf } from './rules.ts';

export interface Step {
  slot: Slot;
  action: ActionBody;
}

/**
 * Was fehlt, bis die Aufgabe für beide erledigt ist, in der Reihenfolge a vor b. `acted`: wer seinen Teil
 * schon getan hat. Bei Kennst-du-mich tippt a richtig und b daneben; über frei getippte Antworten
 * entscheidet hier niemand.
 */
export function finishingSteps(taskId: string, chapter: RulesChapter, acted: Slot[] = []): Step[] {
  const spec = chapter.tasks.find((t) => t.id === taskId);
  if (!spec) return [];
  switch (spec.type) {
    case 'puzzle':
      return [{ slot: canSolve(spec.kind, 'lead') ? spec.lead : otherSlot(spec.lead), action: { type: 'puzzle.solve', taskId } }];
    case 'knowme': {
      const answer = (i: number): KnowMeAnswer =>
        spec.answer.kind === 'choice' ? { kind: 'choice', option: i % spec.answer.options.length } : { kind: 'text', text: `Answer ${i + 1}` };
      const plays: Record<Slot, { own: KnowMeAnswer; guess: KnowMeAnswer }> = {
        a: { own: answer(0), guess: answer(1) },
        b: { own: answer(1), guess: answer(1) },
      };
      return (['a', 'b'] as const).filter((slot) => !acted.includes(slot)).map((slot): Step => ({ slot, action: { type: 'knowme.submit', taskId, ...plays[slot] } }));
    }
    case 'reallife':
      return receiversOf(spec)
        .filter((slot) => !acted.includes(slot))
        .map((slot): Step => ({ slot, action: { type: 'reallife.confirm', taskId } }));
  }
}

/** Dasselbe für die laufende Aufgabe eines Stands; leer, wenn keine offen ist. */
export function stepsToFinish(task: Pick<ActiveTask, 'taskId' | 'completedAt' | 'progress'> | null, chapter: RulesChapter): Step[] {
  if (!task || task.completedAt !== null) return [];
  return finishingSteps(
    task.taskId,
    chapter,
    (['a', 'b'] as const).filter((slot) => hasActed(task.progress, slot)),
  );
}
