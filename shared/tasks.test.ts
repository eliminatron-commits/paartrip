// Der Aufgabenablauf: wann eine Aufgabe erscheint, wie jede der drei Arten erledigt wird, was verborgen
// bleibt und wer welche Mitteilung bekommt. Gespielt wird mit den echten Inhalten und gestellter Uhr.
import { describe, expect, it } from 'vitest';
import generated from '../generated/content-rules.json';
import type { Action, ActionBody } from './actions.ts';
import { stepsToFinish } from './autoplay.ts';
import type { RulesContent } from './content-schema.ts';
import { type HouseState, otherSlot, type Slot } from './model.ts';
import { canSolve, PUZZLE_KINDS } from './puzzles/kinds.ts';
import { advance, announceTask, applyAction, type Applied, createHouse, joinHouse, puzzleRole, receiversOf, type RuleContext } from './rules.ts';
import { nextDay } from './time.ts';
import { deriveView } from './view.ts';

const content = generated as unknown as RulesContent;
const chapter = content.chapters[0]!;
type TestTask = (typeof chapter.tasks)[number];

// Die Tagesregel rechnet in Europe/Berlin; im November ist das UTC+1.
const MON = '2026-11-09';
const TUE = '2026-11-10';
const WED = '2026-11-11';
const THU = '2026-11-12';

/** Serverzeit an diesem Berliner Tag zu dieser Berliner Uhrzeit. */
function on(day: string, time = '12:00:00', source: RulesContent = content): RuleContext {
  return { content: source, now: new Date(`${day}T${time}+01:00`).toISOString() };
}

/** Inhalte mit genau diesen Aufgaben, in dieser Reihenfolge. */
function only(...tasks: (TestTask | undefined)[]): RulesContent {
  const picked = tasks.map((task) => {
    if (!task) throw new Error('Aufgabe fehlt in den Inhalten');
    return task;
  });
  return { chapters: [{ ...chapter, taskOrder: picked.map((t) => t.id), tasks: picked }] };
}

const puzzleOf = (kind: (typeof PUZZLE_KINDS)[number]) => chapter.tasks.find((t) => t.type === 'puzzle' && t.kind === kind);
const anyPuzzle = chapter.tasks.find((t) => t.type === 'puzzle');
const choiceQuestion = chapter.tasks.find((t) => t.type === 'knowme' && t.answer.kind === 'choice');
const textQuestion = chapter.tasks.find((t) => t.type === 'knowme' && t.answer.kind === 'text');
const forOne = chapter.tasks.find((t) => t.type === 'reallife' && t.doer !== 'both');
const forBoth = chapter.tasks.find((t) => t.type === 'reallife' && t.doer === 'both');

let n = 0;
function act(body: ActionBody, ctx: RuleContext): Action {
  n += 1;
  return { ...body, id: `task-action-${String(n).padStart(4, '0')}`, at: ctx.now } as Action;
}

function house(ctx: RuleContext): HouseState {
  const state = joinHouse(createHouse('house-1', 'Ada', ctx), 'Bao', ctx);
  if (!state) throw new Error('Beitritt fehlgeschlagen');
  return state;
}

const attempt = (state: HouseState, slot: Slot, body: ActionBody, ctx: RuleContext): Applied => applyAction(state, slot, act(body, ctx), ctx);

/** Wendet eine Aktion an und verlangt, dass sie gilt. */
function play(state: HouseState, slot: Slot, body: ActionBody, ctx: RuleContext): HouseState {
  const applied = attempt(state, slot, body, ctx);
  expect(applied.result, JSON.stringify(body)).toMatchObject({ outcome: 'applied' });
  return applied.state;
}

/** Beide erledigen die laufende Aufgabe. */
function finish(state: HouseState, ctx: RuleContext): HouseState {
  for (const step of stepsToFinish(state.task, ctx.content.chapters[0]!)) state = play(state, step.slot, step.action, ctx);
  return state;
}

const viewOf = (state: HouseState, slot: Slot, ctx: RuleContext) => deriveView(state, slot, { content: ctx.content, now: ctx.now, pairingCode: 'TESTCODE' });

describe('Tagesablauf', () => {
  it('die erste Aufgabe erscheint, sobald beide eingezogen sind – vorher gibt es keine', () => {
    const alone = createHouse('house-1', 'Ada', on(MON));
    expect(alone.task).toBeNull();
    expect(advance(alone, on(THU))).toBe(alone);

    const state = house(on(MON));
    expect(state.task).toMatchObject({ taskId: chapter.taskOrder[0], availableOn: MON, completedAt: null });
  });

  it('solange die Aufgabe offen ist, erscheint keine weitere – egal, wie viele Tage vergehen', () => {
    const state = house(on(MON));
    expect(advance(state, on(THU))).toBe(state);
    expect(viewOf(state, 'a', on(THU)).nextTaskOn).toBeNull();
  });

  it('am Tag ihres Erscheinens erledigt: Die nächste Aufgabe kommt erst am folgenden Kalendertag', () => {
    const state = finish(house(on(MON)), on(MON));
    expect(state.done).toHaveLength(1);
    // Die erledigte Aufgabe bleibt stehen.
    expect(state.task).toMatchObject({ taskId: chapter.taskOrder[0], completedAt: on(MON).now });
    expect(advance(state, on(MON, '23:59:59'))).toBe(state);
    expect(viewOf(state, 'a', on(MON)).nextTaskOn).toBe(TUE);

    const next = advance(state, on(TUE, '00:00:01'));
    expect(next.task).toMatchObject({ taskId: chapter.taskOrder[1], availableOn: TUE, completedAt: null });
    expect(viewOf(next, 'a', on(TUE)).nextTaskOn).toBeNull();
  });

  it('der Tag wechselt um Mitternacht in Berlin, nicht in UTC', () => {
    const state = finish(house(on(MON)), on(MON));
    // 22:30 UTC am Montag ist in Berlin noch Montag, 23:30 UTC schon Dienstag.
    expect(advance(state, { content, now: `${MON}T22:30:00.000Z` })).toBe(state);
    expect(advance(state, { content, now: `${MON}T23:30:00.000Z` }).task).toMatchObject({ taskId: chapter.taskOrder[1], availableOn: TUE });
  });

  it('nach einer Pause rückt die nächste Aufgabe gleich nach, die übernächste frühestens am Tag darauf', () => {
    // Montag erschienen, erst Mittwoch erledigt: Die zweite Aufgabe ist sofort da.
    let state = finish(house(on(MON)), on(WED));
    expect(state.done).toHaveLength(1);
    expect(state.task).toMatchObject({ taskId: chapter.taskOrder[1], availableOn: WED, completedAt: null });

    // Auch sie am Mittwoch erledigt: Die dritte wartet bis Donnerstag.
    state = finish(state, on(WED, '18:00:00'));
    expect(state.task).toMatchObject({ taskId: chapter.taskOrder[1], completedAt: on(WED, '18:00:00').now });
    expect(viewOf(state, 'b', on(WED, '18:00:00')).nextTaskOn).toBe(THU);
    expect(advance(state, on(THU)).task).toMatchObject({ taskId: chapter.taskOrder[2], availableOn: THU });
  });

  it('die nächste Aufgabe erscheint erst, wenn beide ihren Teil getan haben', () => {
    const source = only(choiceQuestion, anyPuzzle);
    const [first] = stepsToFinish(house(on(MON, undefined, source)).task, source.chapters[0]!);
    let state = play(house(on(MON, undefined, source)), first!.slot, first!.action, on(MON, undefined, source));
    expect(state.done).toHaveLength(0);
    expect(advance(state, on(THU, undefined, source))).toBe(state);

    state = finish(state, on(THU, undefined, source));
    expect(state.done).toHaveLength(1);
    expect(state.task).toMatchObject({ taskId: anyPuzzle!.id, availableOn: THU });
  });

  it('nach der letzten Aufgabe des Kapitels erscheint keine weitere', () => {
    const source = only(anyPuzzle);
    const state = finish(house(on(MON, undefined, source)), on(MON, undefined, source));
    expect(state.done).toHaveLength(1);
    expect(advance(state, on(THU, undefined, source))).toBe(state);
    expect(viewOf(state, 'a', on(MON, undefined, source)).nextTaskOn).toBeNull();
  });

  it('jede Aufgabe der Inhalte lässt sich von zwei Spielern erledigen, eine pro Tag, bis das Kapitel durch ist', () => {
    let day = MON;
    let state = house(on(day));
    for (const id of chapter.taskOrder) {
      expect(state.task).toMatchObject({ taskId: id, availableOn: day, completedAt: null });
      state = finish(state, on(day));
      day = nextDay(day);
      state = advance(state, on(day));
    }
    expect(state.done.map((d) => d.taskId)).toEqual(chapter.taskOrder);
  });
});

describe('Erledigte Aufgabe → Bauzug → Meilenstein', () => {
  const first = chapter.milestones[0]!;

  /** Spielt bis kurz vor den ersten Meilenstein: Die Aufgabe, die ihn auslöst, ist offen. */
  function beforeMilestone(): { state: HouseState; day: string } {
    expect(chapter.tasks.length, 'die Inhalte reichen nicht bis zum ersten Meilenstein').toBeGreaterThanOrEqual(first);
    let day = MON;
    let state = house(on(day));
    for (let done = 0; done < first - 1; done++) {
      state = finish(state, on(day));
      day = nextDay(day);
      state = advance(state, on(day));
    }
    return { state, day };
  }

  it('jede erledigte Aufgabe bringt einen Bauzug, am Meilenstein öffnet sich das Geschenk', () => {
    const { state: before, day } = beforeMilestone();
    expect(before.done).toHaveLength(first - 1);
    expect(before.buildTurns.map((t) => t.n)).toEqual(Array.from({ length: first - 1 }, (_, i) => i + 1));
    expect(before.milestones).toEqual([]);

    const state = finish(before, on(day));
    expect(state.buildTurns.at(-1)).toMatchObject({ n: first });
    expect(state.milestones).toMatchObject([{ at: first, reachedAt: on(day).now }]);
  });

  it('wer den Meilenstein selbst auslöst, bekommt über sein Geschenk keine Mitteilung – der andere über seines schon', () => {
    const { state: before, day } = beforeMilestone();
    const steps = stepsToFinish(before.task, chapter);
    const last = steps.at(-1)!;

    for (const giver of ['a', 'b'] as const) {
      // Das Geschenk geht an den jeweils anderen und wartet am ersten Meilenstein.
      let state = play(before, giver, { type: 'coupon.deposit', text: 'A slow morning' }, on(day));
      expect(state.coupons.at(-1)).toMatchObject({ to: otherSlot(giver), milestone: first });
      for (const step of steps.slice(0, -1)) state = play(state, step.slot, step.action, on(day));
      const reached = attempt(state, last.slot, last.action, on(day));
      expect(reached.state.coupons.at(-1)).toMatchObject({ state: 'unlocked' });

      const receiver = otherSlot(giver);
      const told = reached.effects.filter((effect) => effect.kind === 'coupon_unlocked');
      expect(told).toEqual(receiver === last.slot ? [] : [{ to: receiver, kind: 'coupon_unlocked' }]);
      // An den Handelnden selbst geht nie etwas.
      expect(reached.effects.filter((effect) => effect.to === last.slot)).toEqual([]);
    }
  });
});

describe('Rätsel', () => {
  it.each(PUZZLE_KINDS)('%s: Abschließen darf nur, wer die Lösung eingibt – dann ist es für beide erledigt', (kind) => {
    const task = puzzleOf(kind);
    // Jede Rätselart braucht eine Variante in den Inhalten.
    expect(task, `Variante für ${kind} fehlt in den Inhalten`).toBeDefined();
    if (!task || task.type !== 'puzzle') return;
    const source = only(task);
    const ctx = on(MON, undefined, source);

    for (const slot of ['a', 'b'] as const) {
      const state = house(ctx);
      const applied = attempt(state, slot, { type: 'puzzle.solve', taskId: task.id }, ctx);
      if (canSolve(kind, puzzleRole(task, slot))) {
        expect(applied.result).toMatchObject({ outcome: 'applied' });
        expect(applied.state.done).toEqual([{ taskId: task.id, completedAt: ctx.now, progress: { type: 'puzzle', solvedBy: slot } }]);
        expect(applied.state.buildTurns).toHaveLength(1);
        expect(applied.effects).toEqual([{ to: otherSlot(slot), kind: 'partner_done' }]);
      } else {
        expect(applied.result).toMatchObject({ outcome: 'rejected', reason: 'forbidden' });
        expect(applied.state).toBe(state);
      }
    }
  });

  it('ein gelöstes Rätsel lässt sich nicht noch einmal lösen', () => {
    const task = puzzleOf('spot-difference')!;
    const ctx = on(MON, undefined, only(task, anyPuzzle));
    const solved = play(house(ctx), 'a', { type: 'puzzle.solve', taskId: task.id }, ctx);
    // Der andere war offline und reicht seine Lösung nach: abgelehnt, nichts doppelt gezählt.
    const late = attempt(solved, 'b', { type: 'puzzle.solve', taskId: task.id }, ctx);
    expect(late.result).toMatchObject({ outcome: 'rejected', reason: 'stale' });
    expect(late.state).toBe(solved);
    expect(late.state.done).toHaveLength(1);
  });

  it('was nicht die laufende Aufgabe ist, lässt sich nicht lösen', () => {
    const ctx = on(MON, undefined, only(choiceQuestion, anyPuzzle));
    const state = house(ctx);
    const solver = stepsToFinish({ taskId: anyPuzzle!.id, completedAt: null, progress: { type: 'puzzle', solvedBy: null } }, ctx.content.chapters[0]!)[0]!.slot;
    // Das Rätsel ist erst morgen dran.
    expect(attempt(state, solver, { type: 'puzzle.solve', taskId: anyPuzzle!.id }, ctx).result).toMatchObject({ reason: 'stale' });
    // Eine Frage ist kein Rätsel, und eine unbekannte Aufgabe gibt es nicht.
    expect(attempt(state, solver, { type: 'puzzle.solve', taskId: choiceQuestion!.id }, ctx).result).toMatchObject({ reason: 'invalid' });
    expect(attempt(state, solver, { type: 'puzzle.solve', taskId: 'no-such-task' }, ctx).result).toMatchObject({ reason: 'invalid' });
  });
});

describe('Kennst-du-mich', () => {
  const choice = (option: number) => ({ kind: 'choice', option }) as const;
  const text = (value: string) => ({ kind: 'text', text: value }) as const;

  it('aufgedeckt wird erst, wenn beide abgegeben haben', () => {
    const task = textQuestion!;
    const ctx = on(MON, undefined, only(task));
    let state = house(ctx);
    const submitted = attempt(state, 'a', { type: 'knowme.submit', taskId: task.id, own: text('Bánh cuốn'), guess: text('Schnitzel') }, ctx);
    expect(submitted.effects).toEqual([{ to: 'b', kind: 'partner_done' }]);
    state = submitted.state;
    expect(state.done).toHaveLength(0);

    // b erfährt nur, dass a abgegeben hat – weder a's Antwort noch a's Tipp.
    const hidden = viewOf(state, 'b', ctx);
    expect(hidden.task?.progress).toEqual({ type: 'knowme', mine: null, theirsSubmitted: true, theirs: null, hearts: [], judged: [] });
    expect(JSON.stringify(hidden)).not.toContain('Bánh cuốn');
    expect(JSON.stringify(hidden)).not.toContain('Schnitzel');
    // a sieht die eigene Abgabe.
    expect(viewOf(state, 'a', ctx).task?.progress).toMatchObject({ mine: { own: text('Bánh cuốn') }, theirsSubmitted: false, theirs: null });

    state = play(state, 'b', { type: 'knowme.submit', taskId: task.id, own: text('Spätzle'), guess: text('Phở') }, ctx);
    expect(state.done).toHaveLength(1);
    for (const slot of ['a', 'b'] as const) {
      const open = viewOf(state, slot, ctx);
      expect(open.task?.progress).toMatchObject({ mine: expect.anything(), theirs: expect.anything() });
      expect(JSON.stringify(open)).toContain('Bánh cuốn');
      expect(JSON.stringify(open)).toContain('Spätzle');
    }
  });

  it('Auswahlfrage: Ein Treffer bringt ein Herz, ein Fehltreffer hat keine Folge', () => {
    const task = choiceQuestion!;
    const ctx = on(MON, undefined, only(task));
    let state = house(ctx);
    // a wählt 0 und tippt bei b richtig auf 1; b wählt 1 und tippt bei a daneben.
    state = play(state, 'a', { type: 'knowme.submit', taskId: task.id, own: choice(0), guess: choice(1) }, ctx);
    state = play(state, 'b', { type: 'knowme.submit', taskId: task.id, own: choice(1), guess: choice(1) }, ctx);
    expect(state.done).toHaveLength(1);
    expect(state.done[0]!.progress).toMatchObject({ hearts: ['a'], judged: [] });
    expect(state.buildTurns).toHaveLength(1);

    // Beide treffen: zwei Herzen.
    let both = house(ctx);
    both = play(both, 'b', { type: 'knowme.submit', taskId: task.id, own: choice(1), guess: choice(0) }, ctx);
    both = play(both, 'a', { type: 'knowme.submit', taskId: task.id, own: choice(0), guess: choice(1) }, ctx);
    expect(both.done[0]!.progress).toMatchObject({ hearts: ['a', 'b'] });
  });

  it('jeder gibt genau einmal ab, und nur etwas, das zur Frage passt', () => {
    const task = choiceQuestion!;
    if (task.type !== 'knowme' || task.answer.kind !== 'choice') throw new Error('Auswahlfrage erwartet');
    const ctx = on(MON, undefined, only(task));
    const state = house(ctx);
    const beyond = task.answer.options.length;
    expect(attempt(state, 'a', { type: 'knowme.submit', taskId: task.id, own: choice(beyond), guess: choice(0) }, ctx).result).toMatchObject({ reason: 'invalid' });
    expect(attempt(state, 'a', { type: 'knowme.submit', taskId: task.id, own: choice(0), guess: text('Coffee') }, ctx).result).toMatchObject({ reason: 'invalid' });

    const once = play(state, 'a', { type: 'knowme.submit', taskId: task.id, own: choice(0), guess: choice(1) }, ctx);
    const again = attempt(once, 'a', { type: 'knowme.submit', taskId: task.id, own: choice(1), guess: choice(1) }, ctx);
    expect(again.result).toMatchObject({ outcome: 'rejected', reason: 'stale' });
    expect(again.state).toBe(once);
  });

  it('eine frei getippte Antwort darf nicht länger sein, als die Frage erlaubt', () => {
    const task = textQuestion!;
    if (task.type !== 'knowme' || task.answer.kind !== 'text') throw new Error('Frage mit freier Antwort erwartet');
    const ctx = on(MON, undefined, only(task));
    const tooLong = 'x'.repeat(task.answer.maxLength + 1);
    expect(attempt(house(ctx), 'a', { type: 'knowme.submit', taskId: task.id, own: text(tooLong), guess: text('ok') }, ctx).result).toMatchObject({ reason: 'invalid' });
    expect(attempt(house(ctx), 'a', { type: 'knowme.submit', taskId: task.id, own: choice(0), guess: choice(0) }, ctx).result).toMatchObject({ reason: 'invalid' });
  });

  describe('frei getippte Antworten', () => {
    const task = textQuestion!;
    const source = only(task, anyPuzzle);
    const ctx = on(MON, undefined, source);
    const revealed = () => {
      let state = house(ctx);
      state = play(state, 'a', { type: 'knowme.submit', taskId: task.id, own: text('Bananas'), guess: text('Rice') }, ctx);
      return play(state, 'b', { type: 'knowme.submit', taskId: task.id, own: text('Rice with egg'), guess: text('Strawberries') }, ctx);
    };

    it('die Aufgabe ist mit der zweiten Abgabe erledigt – auf die Entscheidung wartet nichts', () => {
      const state = revealed();
      expect(state.done).toHaveLength(1);
      expect(state.done[0]!.progress).toMatchObject({ hearts: [], judged: [] });
      expect(state.buildTurns).toHaveLength(1);
    });

    it('wer geantwortet hat, entscheidet, ob der Tipp des anderen zählt', () => {
      // a hat "Bananas" geantwortet, b tippte "Strawberries": zählt nicht.
      let state = play(revealed(), 'a', { type: 'knowme.judge', taskId: task.id, counts: false }, ctx);
      expect(state.done[0]!.progress).toMatchObject({ hearts: [], judged: ['a'] });
      // b hat "Rice with egg" geantwortet, a tippte "Rice": zählt – das Herz bekommt a.
      const judged = attempt(state, 'b', { type: 'knowme.judge', taskId: task.id, counts: true }, ctx);
      expect(judged.result).toMatchObject({ outcome: 'applied' });
      expect(judged.effects).toEqual([]);
      state = judged.state;
      expect(state.done[0]!.progress).toMatchObject({ hearts: ['a'], judged: ['a', 'b'] });
      // Die noch stehende erledigte Aufgabe zeigt dasselbe.
      expect(state.task?.progress).toEqual(state.done[0]!.progress);

      // Jeder entscheidet nur einmal.
      const again = attempt(state, 'b', { type: 'knowme.judge', taskId: task.id, counts: false }, ctx);
      expect(again.result).toMatchObject({ outcome: 'rejected', reason: 'stale' });
      expect(again.state).toBe(state);
    });

    it('die Entscheidung geht auch noch, wenn längst die nächste Aufgabe dran ist', () => {
      const later = on(TUE, undefined, source);
      const next = advance(revealed(), later);
      expect(next.task).toMatchObject({ taskId: anyPuzzle!.id });
      const state = play(next, 'a', { type: 'knowme.judge', taskId: task.id, counts: true }, later);
      expect(state.done[0]!.progress).toMatchObject({ hearts: ['b'], judged: ['a'] });
      expect(state.task).toBe(next.task);
    });

    it('vor dem Aufdecken gibt es nichts zu entscheiden, bei Auswahlfragen nie', () => {
      const half = play(house(ctx), 'a', { type: 'knowme.submit', taskId: task.id, own: text('Bananas'), guess: text('Rice') }, ctx);
      expect(attempt(half, 'a', { type: 'knowme.judge', taskId: task.id, counts: true }, ctx).result).toMatchObject({ reason: 'stale' });

      const choiceCtx = on(MON, undefined, only(choiceQuestion));
      const done = finish(house(choiceCtx), choiceCtx);
      expect(attempt(done, 'a', { type: 'knowme.judge', taskId: choiceQuestion!.id, counts: true }, choiceCtx).result).toMatchObject({ reason: 'invalid' });
    });
  });
});

describe('Aufgabe im echten Leben', () => {
  it('richtet sie sich an einen, gilt sie erst mit der Bestätigung des anderen als erledigt', () => {
    const task = forOne!;
    if (task.type !== 'reallife' || task.doer === 'both') throw new Error('Aufgabe für einen erwartet');
    const ctx = on(MON, undefined, only(task));
    const state = house(ctx);
    expect(receiversOf(task)).toEqual([otherSlot(task.doer)]);

    // Wer sie ausführt, kann sich den Erhalt nicht selbst bestätigen.
    const self = attempt(state, task.doer, { type: 'reallife.confirm', taskId: task.id }, ctx);
    expect(self.result).toMatchObject({ outcome: 'rejected', reason: 'forbidden' });
    expect(self.state.done).toHaveLength(0);

    const confirmed = attempt(state, otherSlot(task.doer), { type: 'reallife.confirm', taskId: task.id }, ctx);
    expect(confirmed.result).toMatchObject({ outcome: 'applied' });
    expect(confirmed.state.done).toEqual([{ taskId: task.id, completedAt: ctx.now, progress: { type: 'reallife', confirmedBy: [otherSlot(task.doer)] } }]);
    expect(confirmed.state.buildTurns).toHaveLength(1);
    expect(confirmed.effects).toEqual([{ to: task.doer, kind: 'partner_done' }]);
  });

  it('richtet sie sich an beide, bestätigen beide', () => {
    const task = forBoth!;
    const ctx = on(MON, undefined, only(task));
    const first = attempt(house(ctx), 'b', { type: 'reallife.confirm', taskId: task.id }, ctx);
    expect(first.state.done).toHaveLength(0);
    expect(first.state.task).toMatchObject({ completedAt: null, progress: { confirmedBy: ['b'] } });
    expect(first.effects).toEqual([{ to: 'a', kind: 'partner_done' }]);

    // Zweimal bestätigen zählt nicht doppelt.
    expect(attempt(first.state, 'b', { type: 'reallife.confirm', taskId: task.id }, ctx).result).toMatchObject({ reason: 'stale' });

    const second = attempt(first.state, 'a', { type: 'reallife.confirm', taskId: task.id }, ctx);
    expect(second.state.done).toHaveLength(1);
    expect(second.effects).toEqual([{ to: 'b', kind: 'partner_done' }]);
  });
});

describe('Mitteilung "neue Aufgabe" am Morgen', () => {
  const source = only(anyPuzzle, choiceQuestion);
  /** Montag gelöst; über Nacht erscheint die Frage. */
  const overnight = () => advance(finish(house(on(MON, undefined, source)), on(MON, undefined, source)), on(TUE, '07:00:00', source));

  it('geht an beide, solange keiner seinen Teil getan hat', () => {
    const state = overnight();
    expect(state.task).toMatchObject({ taskId: choiceQuestion!.id, availableOn: TUE });
    expect(announceTask(state, on(TUE, '07:00:00', source))).toEqual([
      { to: 'a', kind: 'new_task' },
      { to: 'b', kind: 'new_task' },
    ]);
  });

  it('wer schon abgegeben hat, bekommt keine', () => {
    const early = on(TUE, '06:30:00', source);
    const state = play(advance(overnight(), early), 'a', { type: 'knowme.submit', taskId: choiceQuestion!.id, own: { kind: 'choice', option: 0 }, guess: { kind: 'choice', option: 0 } }, early);
    expect(announceTask(state, on(TUE, '07:00:00', source))).toEqual([{ to: 'b', kind: 'new_task' }]);
  });

  it('für die Aufgabe von gestern oder eine erledigte gibt es keine – nie eine Mahnung', () => {
    const state = overnight();
    expect(announceTask(state, on(WED, '07:00:00', source))).toEqual([]);
    expect(announceTask(finish(state, on(TUE, '06:00:00', source)), on(TUE, '07:00:00', source))).toEqual([]);
    expect(announceTask(createHouse('house-2', 'Ada', on(MON, undefined, source)), on(MON, '07:00:00', source))).toEqual([]);
  });
});
