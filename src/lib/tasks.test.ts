import { describe, expect, it } from 'vitest';
import generated from '../../generated/content.json';
import type { Action, ActionBody } from '../../shared/actions.ts';
import { stepsToFinish } from '../../shared/autoplay.ts';
import type { Chapter, Content, Task } from '../../shared/content-schema.ts';
import { type HouseState, type HouseView, otherSlot, type Slot } from '../../shared/model.ts';
import { advance, applyAction, createHouse, joinHouse, type RuleContext } from '../../shared/rules.ts';
import { nextDay } from '../../shared/time.ts';
import { deriveView } from '../../shared/view.ts';
import { myStepOpen, reveals, taskSent, today, todayWaits } from './tasks.ts';

// Die Sichten entstehen wie im Betrieb: Regeln anwenden, dann für einen Spieler ableiten.
const full = generated as unknown as Content;
const real = full.chapters[0]!;
const DAY = '2026-11-09';

const pick = (match: (task: Task) => boolean): Task => {
  const task = real.tasks.find(match);
  if (!task) throw new Error('Aufgabe fehlt in den Inhalten');
  return task;
};
const puzzle = pick((t) => t.type === 'puzzle');
const choiceQuestion = pick((t) => t.type === 'knowme' && t.answer.kind === 'choice');
const textQuestion = pick((t) => t.type === 'knowme' && t.answer.kind === 'text');
const forOne = pick((t) => t.type === 'reallife' && t.doer !== 'both');

/** Ein Kapitel mit genau diesen Aufgaben, in dieser Reihenfolge. */
function game(...tasks: Task[]) {
  const chapter: Chapter = { ...real, taskOrder: tasks.map((t) => t.id), tasks };
  const content: Content = { ...full, chapters: [chapter] };
  const at = (day: string): RuleContext => ({ content, now: `${day}T11:00:00.000Z` });
  let n = 0;
  const act = (body: ActionBody, day: string): Action => ({ ...body, id: `tasks-action-${String(++n).padStart(4, '0')}`, at: at(day).now }) as Action;
  return {
    chapter,
    start: (): HouseState => joinHouse(createHouse('house-1', 'Ada', at(DAY)), 'Bao', at(DAY))!,
    play(state: HouseState, slot: Slot, body: ActionBody, day = DAY): HouseState {
      const applied = applyAction(state, slot, act(body, day), at(day));
      expect(applied.result, JSON.stringify(body)).toMatchObject({ outcome: 'applied' });
      return applied.state;
    },
    /** Beide erledigen die laufende Aufgabe; danach beginnt der nächste Tag. */
    finish(state: HouseState, day = DAY): HouseState {
      for (const step of stepsToFinish(state.task, chapter)) state = this.play(state, step.slot, step.action, day);
      return advance(state, at(nextDay(day)));
    },
    view: (state: HouseState, you: Slot, day = DAY): HouseView => deriveView(state, you, { content, now: at(day).now, pairingCode: 'ABCD2345' }),
    queued: (body: ActionBody): Action[] => [act(body, DAY)],
  };
}

describe('die Tagesaufgabe', () => {
  it('ohne zweiten Spieler gibt es keine; danach die erste der Reihenfolge samt ihrem Inhalt', () => {
    const g = game(puzzle, choiceQuestion);
    const content: Content = { ...full, chapters: [g.chapter] };
    const alone = createHouse('house-1', 'Ada', { content, now: `${DAY}T11:00:00.000Z` });
    expect(today(g.view(alone, 'a'), g.chapter)).toBeNull();

    const now = today(g.view(g.start(), 'b'), g.chapter);
    expect(now).toMatchObject({ done: false, spec: { id: puzzle.id }, task: { taskId: puzzle.id } });
  });

  it('eine erledigte Aufgabe bleibt als erledigt stehen, bis die nächste erscheint', () => {
    const g = game(puzzle, choiceQuestion);
    let state = g.start();
    for (const step of stepsToFinish(state.task, g.chapter)) state = g.play(state, step.slot, step.action);
    expect(today(g.view(state, 'a'), g.chapter)).toMatchObject({ done: true, spec: { id: puzzle.id } });
    expect(g.view(state, 'a').nextTaskOn).toBe(nextDay(DAY));
  });

  it('eine Aufgabe, die diese Version der App nicht kennt, ergibt keine statt eines Fehlers', () => {
    const g = game(puzzle);
    const other: Chapter = { ...g.chapter, tasks: [] };
    expect(today(g.view(g.start(), 'a'), other)).toBeNull();
  });
});

describe('was in der App auf mich wartet', () => {
  it('ein offenes Rätsel wartet auf beide – bis die eigene Lösung unterwegs ist', () => {
    const g = game(puzzle);
    const state = g.start();
    for (const you of ['a', 'b'] as const) {
      const view = g.view(state, you);
      expect(myStepOpen(today(view, g.chapter), you, [])).toBe(true);
      expect(todayWaits(view, g.chapter, [])).toBe(true);
    }
    const sent = g.queued({ type: 'puzzle.solve', taskId: puzzle.id });
    expect(taskSent(sent, 'puzzle.solve', puzzle.id)).toBe(true);
    expect(taskSent(sent, 'puzzle.solve', 'another-task')).toBe(false);
    expect(todayWaits(g.view(state, 'a'), g.chapter, sent)).toBe(false);
  });

  it('eine Frage wartet auf den, der noch nicht abgegeben hat', () => {
    const g = game(choiceQuestion);
    const submit: ActionBody = { type: 'knowme.submit', taskId: choiceQuestion.id, own: { kind: 'choice', option: 0 }, guess: { kind: 'choice', option: 1 } };
    const open = g.start();
    expect(todayWaits(g.view(open, 'a'), g.chapter, [])).toBe(true);
    // Abgeschickt, aber noch nicht beim Server: nicht noch einmal anbieten.
    expect(todayWaits(g.view(open, 'a'), g.chapter, g.queued(submit))).toBe(false);

    const half = g.play(open, 'a', submit);
    expect(todayWaits(g.view(half, 'a'), g.chapter, [])).toBe(false);
    expect(todayWaits(g.view(half, 'b'), g.chapter, [])).toBe(true);
  });

  it('eine Aufgabe im echten Leben wartet in der App nur auf den, der den Erhalt bestätigt', () => {
    if (forOne.type !== 'reallife' || forOne.doer === 'both') throw new Error('Aufgabe für einen erwartet');
    const g = game(forOne);
    const state = g.start();
    const receiver = otherSlot(forOne.doer);
    expect(todayWaits(g.view(state, forOne.doer), g.chapter, [])).toBe(false);
    expect(todayWaits(g.view(state, receiver), g.chapter, [])).toBe(true);
    expect(todayWaits(g.view(state, receiver), g.chapter, g.queued({ type: 'reallife.confirm', taskId: forOne.id }))).toBe(false);
  });

  it('ist alles erledigt, wartet nichts', () => {
    const g = game(puzzle);
    const state = g.finish(g.start());
    for (const you of ['a', 'b'] as const) expect(todayWaits(g.view(state, you), g.chapter, [])).toBe(false);
  });
});

describe('aufgedeckte Fragen', () => {
  const text = (value: string) => ({ kind: 'text', text: value }) as const;

  it('vor beidseitiger Abgabe gibt es nichts aufzudecken', () => {
    const g = game(choiceQuestion);
    const half = g.play(g.start(), 'a', { type: 'knowme.submit', taskId: choiceQuestion.id, own: { kind: 'choice', option: 0 }, guess: { kind: 'choice', option: 1 } });
    expect(reveals(g.view(half, 'a'), g.chapter, [])).toEqual([]);
    expect(reveals(g.view(half, 'b'), g.chapter, [])).toEqual([]);
  });

  it('Auswahlfrage: jeder sieht beide Antworten und Tipps aus seiner Sicht, Treffer als Herz', () => {
    if (choiceQuestion.type !== 'knowme' || choiceQuestion.answer.kind !== 'choice') throw new Error('Auswahlfrage erwartet');
    const options = choiceQuestion.answer.options;
    const g = game(choiceQuestion, puzzle);
    // a sagt 0 und tippt bei b richtig auf 1; b sagt 1 und tippt bei a daneben.
    let state = g.play(g.start(), 'a', { type: 'knowme.submit', taskId: choiceQuestion.id, own: { kind: 'choice', option: 0 }, guess: { kind: 'choice', option: 1 } });
    state = g.play(state, 'b', { type: 'knowme.submit', taskId: choiceQuestion.id, own: { kind: 'choice', option: 1 }, guess: { kind: 'choice', option: 1 } });

    expect(reveals(g.view(state, 'a'), g.chapter, [])).toEqual([
      {
        taskId: choiceQuestion.id,
        n: 1,
        question: choiceQuestion.question,
        mine: { answer: options[0], theirGuess: options[1] },
        theirs: { answer: options[1], myGuess: options[1] },
        myHeart: true,
        theirHeart: false,
        myVerdict: 'none',
        theirVerdict: false,
      },
    ]);
    expect(reveals(g.view(state, 'b'), g.chapter, [])).toMatchObject([
      { mine: { answer: options[1], theirGuess: options[1] }, theirs: { answer: options[0], myGuess: options[1] }, myHeart: false, theirHeart: true },
    ]);
  });

  it('sie bleibt stehen, bis die nächste Aufgabe erledigt ist – auch wenn schon die nächste dran ist', () => {
    const g = game(choiceQuestion, puzzle, forOne);
    const next = g.finish(g.start());
    expect(today(g.view(next, 'a', nextDay(DAY)), g.chapter)).toMatchObject({ spec: { id: puzzle.id }, done: false });
    expect(reveals(g.view(next, 'a', nextDay(DAY)), g.chapter, [])).toHaveLength(1);

    const later = g.finish(next, nextDay(DAY));
    expect(reveals(g.view(later, 'a', nextDay(nextDay(DAY))), g.chapter, [])).toEqual([]);
  });

  it('frei getippte Antwort: Meine Entscheidung ist offen, dann unterwegs, dann gefallen', () => {
    const g = game(textQuestion, puzzle);
    let state = g.play(g.start(), 'a', { type: 'knowme.submit', taskId: textQuestion.id, own: text('Bananas'), guess: text('Rice') });
    state = g.play(state, 'b', { type: 'knowme.submit', taskId: textQuestion.id, own: text('Rice with egg'), guess: text('Strawberries') });

    const open = reveals(g.view(state, 'a'), g.chapter, []);
    expect(open).toMatchObject([{ mine: { answer: 'Bananas', theirGuess: 'Strawberries' }, theirs: { answer: 'Rice with egg', myGuess: 'Rice' }, myVerdict: 'open', theirVerdict: false, myHeart: false, theirHeart: false }]);
    expect(todayWaits(g.view(state, 'a'), g.chapter, [])).toBe(true);

    const judge: ActionBody = { type: 'knowme.judge', taskId: textQuestion.id, counts: true };
    expect(reveals(g.view(state, 'a'), g.chapter, g.queued(judge))).toMatchObject([{ myVerdict: 'sent' }]);
    expect(todayWaits(g.view(state, 'a'), g.chapter, g.queued(judge))).toBe(false);

    state = g.play(state, 'a', judge);
    // a hat entschieden: b's Tipp zählt. b sieht das Herz und dass über seinen Tipp entschieden ist.
    expect(reveals(g.view(state, 'a'), g.chapter, [])).toMatchObject([{ myVerdict: 'done', theirHeart: true, theirVerdict: false }]);
    expect(reveals(g.view(state, 'b'), g.chapter, [])).toMatchObject([{ myVerdict: 'open', myHeart: true, theirVerdict: true }]);
  });

  it('eine ältere Frage bleibt nur stehen, solange meine Entscheidung aussteht – das Neueste zuerst', () => {
    const g = game(textQuestion, choiceQuestion, puzzle);
    let state = g.finish(g.start());
    state = g.finish(state, nextDay(DAY));
    const day3 = nextDay(nextDay(DAY));

    // Beide haben über die erste Frage noch nicht entschieden: Sie steht unter der zuletzt beantworteten.
    expect(reveals(g.view(state, 'a', day3), g.chapter, []).map((r) => r.taskId)).toEqual([choiceQuestion.id, textQuestion.id]);
    state = g.play(state, 'a', { type: 'knowme.judge', taskId: textQuestion.id, counts: false }, day3);
    expect(reveals(g.view(state, 'a', day3), g.chapter, []).map((r) => r.taskId)).toEqual([choiceQuestion.id]);
    expect(reveals(g.view(state, 'b', day3), g.chapter, []).map((r) => r.taskId)).toEqual([choiceQuestion.id, textQuestion.id]);
  });

  it('eine Sicht, die das Gerät noch von einer früheren Version gespeichert hat, bringt nichts zum Absturz', () => {
    const g = game(textQuestion, puzzle);
    const view = g.view(g.finish(g.start()), 'a', nextDay(DAY));
    // Bis Phase 3 kannten Sichten das Feld `judged` nicht.
    const old = JSON.parse(JSON.stringify(view, (key, value: unknown) => (key === 'judged' ? undefined : value))) as HouseView;
    expect(JSON.stringify(old)).not.toContain('judged');
    expect(reveals(old, g.chapter, [])).toMatchObject([{ taskId: textQuestion.id, myVerdict: 'open', theirVerdict: false }]);
    expect(todayWaits(old, g.chapter, [])).toBe(true);
  });
});
