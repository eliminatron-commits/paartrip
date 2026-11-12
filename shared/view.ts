// Die eine Stelle, an der aus dem Stand des Servers die Sicht eines Spielers wird.
// Alles, was für `you` noch verborgen ist, bleibt hier zurück: die Kennst-du-mich-Antwort des anderen
// vor beidseitiger Abgabe und der Text eines Gutscheins, der für `you` noch verhüllt ist.
// Die Sicht wird Feld für Feld aufgebaut – ein neues Feld im Stand gelangt nie von selbst hinein.
import type { RulesContent } from './content-schema.ts';
import {
  type ActiveTask,
  type ActiveTaskView,
  type Coupon,
  type CouponView,
  type HouseState,
  type HouseView,
  type IsoTime,
  type KnowMeAnswer,
  type KnowMeSubmission,
  otherSlot,
  type Slot,
  type TaskProgress,
  type TaskProgressView,
} from './model.ts';
import { chapterOf } from './rules.ts';
import { dayKey } from './time.ts';

export interface ViewContext {
  content: RulesContent;
  /** Serverzeit. */
  now: IsoTime;
  /** Kopplungscode des Hauses; in die Sicht kommt er nur für a und nur, solange b fehlt. */
  pairingCode: string;
  /** Der Server nimmt Test-Aufgaben an (Bauphase). */
  testActions?: boolean;
}

function answerView(answer: KnowMeAnswer): KnowMeAnswer {
  return answer.kind === 'choice' ? { kind: 'choice', option: answer.option } : { kind: 'text', text: answer.text };
}

function submissionView(submission: KnowMeSubmission | undefined): KnowMeSubmission | null {
  return submission ? { own: answerView(submission.own), guess: answerView(submission.guess) } : null;
}

/** Erledigte Aufgabe: von beiden abgeschlossen und damit für beide aufgedeckt – trotzdem Feld für Feld. */
function doneProgressView(progress: TaskProgress): TaskProgress {
  switch (progress.type) {
    case 'puzzle':
      return { type: 'puzzle', solvedBy: progress.solvedBy };
    case 'reallife':
      return { type: 'reallife', confirmedBy: [...progress.confirmedBy] };
    case 'knowme': {
      const submissions: Partial<Record<Slot, KnowMeSubmission>> = {};
      for (const slot of ['a', 'b'] as const) {
        const submission = submissionView(progress.submissions[slot]);
        if (submission) submissions[slot] = submission;
      }
      return { type: 'knowme', submissions, hearts: [...progress.hearts] };
    }
  }
}

function progressView(progress: TaskProgress, you: Slot): TaskProgressView {
  switch (progress.type) {
    case 'puzzle':
      return { type: 'puzzle', solvedBy: progress.solvedBy };
    case 'reallife':
      return { type: 'reallife', confirmedBy: [...progress.confirmedBy] };
    case 'knowme': {
      const mine = submissionView(progress.submissions[you]);
      const theirs = submissionView(progress.submissions[otherSlot(you)]);
      // Aufgedeckt wird erst, wenn beide abgegeben haben – vorher bleibt nur die Tatsache der Abgabe.
      const revealed = mine !== null && theirs !== null;
      return {
        type: 'knowme',
        mine,
        theirsSubmitted: theirs !== null,
        theirs: revealed ? theirs : null,
        hearts: revealed ? [...progress.hearts] : [],
      };
    }
  }
}

function taskView(task: ActiveTask, you: Slot): ActiveTaskView {
  return {
    taskId: task.taskId,
    availableOn: task.availableOn,
    completedAt: task.completedAt,
    progress: progressView(task.progress, you),
  };
}

function couponView(coupon: Coupon, you: Slot, fixedTexts: Map<string, string>): CouponView {
  // Wer schenkt, kennt den Text; wer beschenkt wird, erst nach dem Freischalten.
  const visible = coupon.state !== 'veiled' || coupon.from === you;
  const text = coupon.kind === 'secret' ? coupon.text : (fixedTexts.get(coupon.id) ?? null);
  return {
    kind: coupon.kind,
    id: coupon.id,
    from: coupon.from,
    to: coupon.to,
    milestone: coupon.milestone,
    state: coupon.state,
    redeemRequestedAt: coupon.redeemRequestedAt,
    redeemedAt: coupon.redeemedAt,
    text: visible ? text : null,
  };
}

export function deriveView(state: HouseState, you: Slot, ctx: ViewContext): HouseView {
  const chapter = chapterOf(state, ctx.content);
  const fixedTexts = new Map(chapter.coupons.map((c) => [c.id, c.text]));
  return {
    houseId: state.id,
    you,
    players: {
      a: { name: state.players.a.name, joinedAt: state.players.a.joinedAt },
      b: state.players.b ? { name: state.players.b.name, joinedAt: state.players.b.joinedAt } : null,
    },
    pairingCode: you === 'a' && !state.players.b ? ctx.pairingCode : null,
    today: dayKey(ctx.now),
    chapter: state.chapter,
    task: state.task ? taskView(state.task, you) : null,
    // Die Tagesregel kommt mit dem Aufgabenablauf (Phase 4).
    nextTaskOn: null,
    done: state.done.map((d) => ({ taskId: d.taskId, completedAt: d.completedAt, progress: doneProgressView(d.progress) })),
    buildTurns: state.buildTurns.map((t) => ({ n: t.n, chooser: t.chooser, offer: [...t.offer], chosen: t.chosen, placedAt: t.placedAt })),
    placements: state.placements.map((p) => ({ pieceId: p.pieceId, spotId: p.spotId })),
    milestones: state.milestones.map((m) => ({ at: m.at, reachedAt: m.reachedAt, decoPiece: m.decoPiece, seenBy: [...m.seenBy] })),
    coupons: state.coupons.map((c) => couponView(c, you, fixedTexts)),
    testActions: ctx.testActions === true,
  };
}
