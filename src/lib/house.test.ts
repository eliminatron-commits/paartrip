import { describe, expect, it } from 'vitest';
import generated from '../../generated/content.json';
import type { Action, ActionBody } from '../../shared/actions.ts';
import type { Content } from '../../shared/content-schema.ts';
import { type HouseState, type HouseView, otherSlot, type Slot } from '../../shared/model.ts';
import { stepsToFinish } from '../../shared/autoplay.ts';
import { advance, applyAction, completeTask, createHouse, freeSpotsFor, joinHouse, type RuleContext } from '../../shared/rules.ts';
import { nextDay } from '../../shared/time.ts';
import { deriveView } from '../../shared/view.ts';
import { awaitsMyConfirm, canDeposit, chapterFor, gifts, memories, myTurn, nextMilestone, nextMove, openMoves, redeemSent, sceneFor, unseenMilestone } from './house.ts';

// Die Sichten entstehen wie im Betrieb: Regeln anwenden, dann für einen Spieler ableiten.
const content = generated as unknown as Content;
const chapter = content.chapters[0]!;
const rules: RuleContext = { content, now: '2026-11-12T10:00:00.000Z' };

let n = 0;
function act(body: ActionBody): Action {
  n += 1;
  return { ...body, id: `action-${String(n).padStart(4, '0')}`, at: rules.now } as Action;
}

function play(state: HouseState, slot: Slot, body: ActionBody): HouseState {
  const applied = applyAction(state, slot, act(body), rules);
  expect(applied.result, JSON.stringify(body)).toMatchObject({ outcome: 'applied' });
  return applied.state;
}

const paired = (): HouseState => joinHouse(createHouse('house-1', 'Ada', rules), 'Bao', rules)!;
/**
 * Erledigt `count` Aufgaben so, wie zwei Spieler es täten: über die echten Regeln, eine pro Tag.
 * Reichen die Aufgaben der Inhalte nicht so weit, zählt für den Rest nur die Anzahl.
 */
const complete = (state: HouseState, count = 1): HouseState => {
  for (let i = 0; i < count; i++) {
    const day = !state.task ? rules.now.slice(0, 10) : state.task.completedAt ? nextDay(state.task.availableOn) : state.task.availableOn;
    const ctx: RuleContext = { content, now: `${day}T10:00:00.000Z` };
    state = advance(state, ctx);
    const steps = stepsToFinish(state.task, chapter);
    if (steps.length === 0) {
      state = completeTask(state, { taskId: `beyond-${state.done.length + 1}`, completedAt: ctx.now, progress: { type: 'puzzle', solvedBy: 'a' } }, ctx).state;
      continue;
    }
    for (const step of steps) {
      const applied = applyAction(state, step.slot, act(step.action), ctx);
      expect(applied.result, JSON.stringify(step.action)).toMatchObject({ outcome: 'applied' });
      state = applied.state;
    }
  }
  return state;
};
const viewOf = (state: HouseState, you: Slot): HouseView => deriveView(state, you, { content, now: rules.now, pairingCode: 'ABCD2345' });

const fixedAt = new Set(chapter.coupons.map((c) => c.milestone));
const freeMilestone = chapter.milestones.find((m) => !fixedAt.has(m))!;

describe('der nächste Schritt im Haus', () => {
  it('ohne erledigte Aufgabe steht nichts an', () => {
    const view = viewOf(paired(), 'a');
    expect(openMoves(view, [])).toEqual([]);
    expect(nextMove([])).toBeNull();
    expect(myTurn([])).toBe(false);
  });

  it('wer wählt, sieht "choose", der andere wartet; nach dem Wählen ist es umgekehrt', () => {
    let state = complete(paired());
    const turn = state.buildTurns[0]!;
    const chooser = turn.chooser;
    const placer = otherSlot(chooser);

    expect(nextMove(openMoves(viewOf(state, chooser), []))).toMatchObject({ kind: 'choose', sent: false, turn: { n: 1 } });
    expect(nextMove(openMoves(viewOf(state, placer), []))).toMatchObject({ kind: 'wait-choose' });
    expect(myTurn(openMoves(viewOf(state, chooser), []))).toBe(true);
    expect(myTurn(openMoves(viewOf(state, placer), []))).toBe(false);

    state = play(state, chooser, { type: 'build.choose', turn: 1, pieceId: turn.offer[0]! });
    expect(nextMove(openMoves(viewOf(state, chooser), []))).toMatchObject({ kind: 'wait-place', pieceId: turn.offer[0] });
    expect(nextMove(openMoves(viewOf(state, placer), []))).toMatchObject({ kind: 'place', pieceId: turn.offer[0], sent: false });

    const spot = freeSpotsFor(chapter.pieces.find((p) => p.id === turn.offer[0])!, state.placements, chapter)[0]!;
    state = play(state, placer, { type: 'build.place', turn: 1, spotId: spot.id });
    expect(openMoves(viewOf(state, 'a'), [])).toEqual([]);
  });

  it('eine eigene Aktion, die noch in der Warteschlange liegt, gilt als abgeschickt – sie wird nicht noch einmal angeboten', () => {
    const state = complete(paired());
    const turn = state.buildTurns[0]!;
    const view = viewOf(state, turn.chooser);
    const queued = [act({ type: 'build.choose', turn: 1, pieceId: turn.offer[0]! })];
    const moves = openMoves(view, queued);
    expect(moves).toMatchObject([{ kind: 'choose', sent: true }]);
    expect(myTurn(moves)).toBe(false);
    // Eine Aktion zu einem anderen Zug zählt nicht.
    expect(openMoves(view, [act({ type: 'build.choose', turn: 2, pieceId: turn.offer[0]! })])).toMatchObject([{ kind: 'choose', sent: false }]);
  });

  it('sind mehrere Aufgaben erledigt, ist nur der älteste Bauzug dran – der nächste folgt mit getauschten Rollen', () => {
    let state = complete(paired(), 2);
    const first = state.buildTurns[0]!;
    const chooser = first.chooser;
    const placer = otherSlot(chooser);
    expect(openMoves(viewOf(state, chooser), []).map((m) => m.kind)).toEqual(['choose']);
    expect(openMoves(viewOf(state, placer), []).map((m) => m.kind)).toEqual(['wait-choose']);

    state = play(state, chooser, { type: 'build.choose', turn: 1, pieceId: first.offer[0]! });
    const spot = freeSpotsFor(chapter.pieces.find((p) => p.id === first.offer[0])!, state.placements, chapter)[0]!;
    state = play(state, placer, { type: 'build.place', turn: 1, spotId: spot.id });
    expect(nextMove(openMoves(viewOf(state, placer), []))).toMatchObject({ kind: 'choose', turn: { n: 2 } });
    expect(nextMove(openMoves(viewOf(state, chooser), []))).toMatchObject({ kind: 'wait-choose', turn: { n: 2 } });
  });

  it('ein Dekostück aus einem Geschenk wartet auf seinen Platz, bis es steht', () => {
    let state = complete(paired(), freeMilestone);
    const deco = chapter.pieces.find((p) => p.milestone === freeMilestone)!;
    for (const you of ['a', 'b'] as const) {
      expect(openMoves(viewOf(state, you), []).filter((m) => m.kind === 'deco')).toEqual([{ kind: 'deco', pieceId: deco.id, sent: false }]);
    }
    const sent = openMoves(viewOf(state, 'a'), [act({ type: 'piece.move', pieceId: deco.id, spotId: 'anywhere' })]);
    expect(sent.find((m) => m.kind === 'deco')).toMatchObject({ sent: true });

    state = play(state, 'b', { type: 'piece.move', pieceId: deco.id, spotId: freeSpotsFor(deco, state.placements, chapter)[0]!.id });
    expect(openMoves(viewOf(state, 'a'), []).filter((m) => m.kind === 'deco')).toEqual([]);
  });
});

describe('Meilensteine', () => {
  it('der nächste ausstehende Meilenstein ergibt sich aus der Zahl erledigter Aufgaben', () => {
    expect(nextMilestone(viewOf(paired(), 'a'), chapter)).toBe(chapter.milestones[0]);
    expect(nextMilestone(viewOf(complete(paired(), chapter.milestones[0]!), 'a'), chapter)).toBe(chapter.milestones[1]);
    expect(nextMilestone(viewOf(complete(paired(), chapter.milestones.at(-1)!), 'a'), chapter)).toBeNull();
  });

  it('ungesehen ist ein Meilenstein, bis der Spieler ihn bestätigt hat – eine wartende Bestätigung zählt schon', () => {
    let state = complete(paired(), chapter.milestones[1]!);
    const [first, second] = chapter.milestones;
    expect(unseenMilestone(viewOf(state, 'a'), [])?.at).toBe(first);
    expect(unseenMilestone(viewOf(state, 'a'), [act({ type: 'milestone.seen', milestone: first! })])?.at).toBe(second);

    state = play(state, 'a', { type: 'milestone.seen', milestone: first! });
    expect(unseenMilestone(viewOf(state, 'a'), [])?.at).toBe(second);
    // Für den anderen bleibt der erste ungesehen.
    expect(unseenMilestone(viewOf(state, 'b'), [])?.at).toBe(first);

    state = play(state, 'a', { type: 'milestone.seen', milestone: second! });
    expect(unseenMilestone(viewOf(state, 'a'), [])).toBeNull();
  });

  it('zu jedem Meilenstein des Kapitels gibt es eine Szene', () => {
    for (const milestone of chapter.milestones) expect(sceneFor(chapter, milestone)?.milestone, `Meilenstein ${milestone}`).toBe(milestone);
    expect(sceneFor(chapter, 99999)).toBeNull();
  });
});

describe('Geschenke', () => {
  it('trennt, was für mich ist und was von mir kommt, jeweils nach Meilenstein', () => {
    let state = paired();
    state = play(state, 'b', { type: 'coupon.deposit', text: 'From Bao' });
    state = play(state, 'a', { type: 'coupon.deposit', text: 'From Ada' });
    for (const you of ['a', 'b'] as const) {
      const lists = gifts(viewOf(state, you));
      expect(lists.forMe.every((c) => c.to === you)).toBe(true);
      expect(lists.fromMe.every((c) => c.from === you)).toBe(true);
      expect(lists.forMe.length + lists.fromMe.length).toBe(state.coupons.length);
      for (const list of [lists.forMe, lists.fromMe]) expect(list.map((c) => c.milestone)).toEqual([...list.map((c) => c.milestone)].sort((x, y) => x - y));
    }
  });

  it('hinterlegen geht, solange ein Meilenstein aussteht – danach nicht mehr', () => {
    expect(canDeposit(viewOf(paired(), 'a'), chapter)).toBe(true);
    expect(canDeposit(viewOf(complete(paired(), chapter.milestones.at(-1)! - 1), 'a'), chapter)).toBe(true);
    expect(canDeposit(viewOf(complete(paired(), chapter.milestones.at(-1)!), 'a'), chapter)).toBe(false);
  });

  it('bestätigen muss der Schenkende, sobald der Beschenkte angefragt hat', () => {
    const fixed = chapter.coupons[0]!;
    let state = complete(paired(), fixed.milestone);
    const coupon = (you: Slot) => viewOf(state, you).coupons.find((c) => c.id === fixed.id)!;
    expect(awaitsMyConfirm(coupon(fixed.from), fixed.from)).toBe(false);

    state = play(state, fixed.to, { type: 'coupon.requestRedeem', couponId: fixed.id });
    expect(awaitsMyConfirm(coupon(fixed.from), fixed.from)).toBe(true);
    expect(awaitsMyConfirm(coupon(fixed.to), fixed.to)).toBe(false);
    expect(redeemSent(coupon(fixed.from), [])).toBe(false);
    expect(redeemSent(coupon(fixed.from), [act({ type: 'coupon.confirmRedeem', couponId: fixed.id })])).toBe(true);

    state = play(state, fixed.from, { type: 'coupon.confirmRedeem', couponId: fixed.id });
    expect(awaitsMyConfirm(coupon(fixed.from), fixed.from)).toBe(false);
  });
});

describe('Erinnerungsstücke', () => {
  const index = chapter.tasks.findIndex((t) => t.type === 'knowme');
  const task = chapter.tasks[index]!;

  it('jede beantwortete Kennst-du-mich-Frage wird zur Notiz mit Frage, beiden Antworten und Herzen', () => {
    if (task.type !== 'knowme') throw new Error('Inhalte ohne Kennst-du-mich-Aufgabe');
    const before = viewOf(complete(paired(), index), 'a');
    expect(memories(before, chapter)).toEqual([]);

    const state = complete(paired(), index + 1);
    const done = state.done[index]!;
    if (done.progress.type !== 'knowme') throw new Error('erwartet: Kennst-du-mich');
    const text = (slot: Slot) => {
      const own = done.progress.type === 'knowme' ? done.progress.submissions[slot]!.own : null;
      if (!own) return '';
      return own.kind === 'text' ? own.text : task.answer.kind === 'choice' ? task.answer.options[own.option]! : '';
    };
    for (const you of ['a', 'b'] as const) {
      expect(memories(viewOf(state, you), chapter)).toEqual([{ n: index + 1, question: task.question, answers: { a: text('a'), b: text('b') }, hearts: done.progress.hearts }]);
    }
  });

  it('eine Aufgabe, die es in den Inhalten nicht (mehr) gibt, ergibt keine Notiz statt eines Fehlers', () => {
    const state = complete(paired(), index + 1);
    const renamed: HouseState = { ...state, done: state.done.map((d) => ({ ...d, taskId: `${d.taskId}-gone` })) };
    expect(memories(viewOf(renamed, 'a'), chapter)).toEqual([]);
  });
});

describe('Kapitel der Sicht', () => {
  it('findet das Kapitel der Sicht in den Inhalten; ein unbekanntes gibt es nicht', () => {
    expect(chapterFor(viewOf(paired(), 'a'), content)?.number).toBe(chapter.number);
    expect(chapterFor({ chapter: 99999 }, content)).toBeNull();
  });
});
