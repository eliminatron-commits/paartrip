// Was die Oberfläche aus der Sicht des Servers ableitet: der nächste Schritt im Haus, Erinnerungsstücke,
// Geschenke. Reine Funktionen ohne Svelte, damit Vitest sie prüfen kann. Nichts hiervon verändert die Sicht –
// wartende eigene Aktionen (`queued`) dienen nur dazu, schon Abgeschicktes nicht noch einmal anzubieten.
import type { Action } from '../../shared/actions.ts';
import type { Chapter, Content, Piece, StoryScene, Task } from '../../shared/content-schema.ts';
import { type BuildTurn, type CouponView, type HouseView, type KnowMeAnswer, otherSlot, type ReachedMilestone, type Slot } from '../../shared/model.ts';
import { milestoneForDeposit, unplacedDeco } from '../../shared/rules.ts';

export function chapterFor(view: Pick<HouseView, 'chapter'>, content: Content): Chapter | null {
  return content.chapters.find((c) => c.number === view.chapter) ?? null;
}

export function pieceMap(chapter: Chapter): Map<string, Piece> {
  return new Map(chapter.pieces.map((p) => [p.id, p]));
}

// ---------------------------------------------------------------- Der nächste Schritt im Haus

/** `sent`: Die eigene Aktion dazu liegt schon in der Warteschlange. */
export type Move =
  | { kind: 'choose'; turn: BuildTurn; sent: boolean }
  | { kind: 'place'; turn: BuildTurn; pieceId: string; sent: boolean }
  | { kind: 'deco'; pieceId: string; sent: boolean }
  | { kind: 'wait-choose'; turn: BuildTurn }
  | { kind: 'wait-place'; turn: BuildTurn; pieceId: string };

/** Alles, was im Haus offen ist: Bauzüge in ihrer Reihenfolge, danach Dekostücke aus Geschenken. */
export function openMoves(view: HouseView, queued: Action[]): Move[] {
  const moves: Move[] = [];
  for (const turn of view.buildTurns) {
    if (turn.placedAt !== null) continue;
    const mine = turn.chooser === view.you;
    if (turn.chosen === null) {
      if (mine) moves.push({ kind: 'choose', turn, sent: queued.some((a) => a.type === 'build.choose' && a.turn === turn.n) });
      else moves.push({ kind: 'wait-choose', turn });
    } else if (mine) {
      moves.push({ kind: 'wait-place', turn, pieceId: turn.chosen });
    } else {
      moves.push({ kind: 'place', turn, pieceId: turn.chosen, sent: queued.some((a) => a.type === 'build.place' && a.turn === turn.n) });
    }
  }
  for (const pieceId of unplacedDeco(view)) {
    moves.push({ kind: 'deco', pieceId, sent: queued.some((a) => a.type === 'piece.move' && a.pieceId === pieceId) });
  }
  return moves;
}

const isMine = (move: Move): move is Extract<Move, { sent: boolean }> => move.kind === 'choose' || move.kind === 'place' || move.kind === 'deco';

/** Der eine Schritt, den die Oberfläche zeigt: zuerst, was ich tun kann, dann schon Abgeschicktes, dann Warten. */
export function nextMove(moves: Move[]): Move | null {
  return moves.find((m) => isMine(m) && !m.sent) ?? moves.find(isMine) ?? moves[0] ?? null;
}

/** Wartet im Haus etwas auf mich? */
export function myTurn(moves: Move[]): boolean {
  return moves.some((m) => isMine(m) && !m.sent);
}

// ---------------------------------------------------------------- Meilensteine

/** Der früheste Meilenstein, dessen Szene und Geschenk dieser Spieler noch nicht gesehen hat. */
export function unseenMilestone(view: HouseView, queued: Action[]): ReachedMilestone | null {
  const sent = new Set(queued.flatMap((a) => (a.type === 'milestone.seen' ? [a.milestone] : [])));
  return [...view.milestones].sort((x, y) => x.at - y.at).find((m) => !m.seenBy.includes(view.you) && !sent.has(m.at)) ?? null;
}

export function sceneFor(chapter: Chapter, milestone: number): StoryScene | null {
  return chapter.story.find((s) => s.milestone === milestone) ?? null;
}

/** Der nächste Meilenstein, der noch aussteht. */
export function nextMilestone(view: HouseView, chapter: Chapter): number | null {
  return chapter.milestones.find((m) => m > view.done.length) ?? null;
}

// ---------------------------------------------------------------- Geschenke

export interface Gifts {
  /** Für mich, nach Meilenstein. */
  forMe: CouponView[];
  /** Von mir. */
  fromMe: CouponView[];
}

export function gifts(view: HouseView): Gifts {
  const sorted = [...view.coupons].sort((x, y) => x.milestone - y.milestone);
  return { forMe: sorted.filter((c) => c.to === view.you), fromMe: sorted.filter((c) => c.from === view.you) };
}

/** Kann noch ein geheimer Gutschein hinterlegt werden? Nach dem letzten Meilenstein des Kapitels nicht mehr. */
export function canDeposit(view: HouseView, chapter: Chapter): boolean {
  return milestoneForDeposit(view, chapter) !== null;
}

/** Ein Gutschein von mir, dessen Einlösen der andere angefragt hat – ich bin mit Bestätigen dran. */
export function awaitsMyConfirm(coupon: CouponView, you: Slot): boolean {
  return coupon.from === you && coupon.state === 'unlocked' && coupon.redeemRequestedAt !== null;
}

export function redeemSent(coupon: CouponView, queued: Action[]): boolean {
  return queued.some((a) => (a.type === 'coupon.requestRedeem' || a.type === 'coupon.confirmRedeem') && a.couponId === coupon.id);
}

// ---------------------------------------------------------------- Erinnerungsstücke

/** Eine beantwortete Kennst-du-mich-Frage: bleibt als gerahmte Notiz im Haus lesbar. */
export interface Memory {
  /** Nummer der erledigten Aufgabe (ab 1). */
  n: number;
  question: string;
  answers: Record<Slot, string>;
  /** Wer die Antwort des anderen richtig getippt hat. */
  hearts: Slot[];
}

function answerText(task: Extract<Task, { type: 'knowme' }>, answer: KnowMeAnswer): string {
  if (answer.kind === 'text') return answer.text;
  return task.answer.kind === 'choice' ? (task.answer.options[answer.option] ?? '') : '';
}

export function memories(view: HouseView, chapter: Chapter): Memory[] {
  const result: Memory[] = [];
  view.done.forEach((done, index) => {
    if (done.progress.type !== 'knowme') return;
    const task = chapter.tasks.find((t) => t.id === done.taskId);
    const { a, b } = done.progress.submissions;
    if (!task || task.type !== 'knowme' || !a || !b) return;
    result.push({
      n: index + 1,
      question: task.question,
      answers: { a: answerText(task, a.own), b: answerText(task, b.own) },
      hearts: [...done.progress.hearts],
    });
  });
  return result;
}

export { otherSlot };
