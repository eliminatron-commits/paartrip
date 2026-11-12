// Spielregeln als reine Funktionen: Stand + Aktion + Inhalte + Serverzeit → neuer Stand.
// Kein Zugriff auf Datenbank, Netz oder Gerätezeit – so prüft Vitest jede Regel ohne Worker.
// Der Worker lädt den Stand, ruft diese Funktionen auf und speichert das Ergebnis.
import type { Action, ActionResult, RejectReason } from './actions.ts';
import type { PushKind } from './api.ts';
import type { RulesChapter, RulesContent } from './content-schema.ts';
import {
  type ActiveTask,
  type BuildTurn,
  type Coupon,
  type DoneTask,
  type HouseState,
  type IsoTime,
  type KnowMeAnswer,
  otherSlot,
  type Placement,
  type Slot,
  type TaskProgress,
} from './model.ts';
import { canSolve, type PuzzleRole } from './puzzles/kinds.ts';
import { dayKey } from './time.ts';

export interface RuleContext {
  content: RulesContent;
  /** Serverzeit. */
  now: IsoTime;
}

/** Push-Auslöser: wer worüber eine Mitteilung bekommt. Der Worker verschickt sie nach dem Speichern. */
export interface PushEffect {
  to: Slot;
  kind: PushKind;
}

export interface Applied {
  state: HouseState;
  result: ActionResult;
  effects: PushEffect[];
}

type RulesPiece = RulesChapter['pieces'][number];
type RulesSpot = RulesChapter['rooms'][number]['spots'][number];
type RulesTask = RulesChapter['tasks'][number];

export function chapterOf(state: Pick<HouseState, 'chapter'>, content: RulesContent): RulesChapter {
  const chapter = content.chapters.find((c) => c.number === state.chapter);
  if (!chapter) throw new Error(`Kapitel ${state.chapter} fehlt in den Inhalten`);
  return chapter;
}

/** Neues Haus mit Spieler a. Die festen Gutscheine des Kapitels liegen von Anfang an verhüllt bereit. */
export function createHouse(id: string, name: string, ctx: RuleContext): HouseState {
  const chapter = ctx.content.chapters[0];
  if (!chapter) throw new Error('Inhalte ohne Kapitel');
  return {
    id,
    chapter: chapter.number,
    createdAt: ctx.now,
    players: { a: { name, joinedAt: ctx.now }, b: null },
    // Die erste Aufgabe erscheint, sobald der zweite Spieler eingezogen ist.
    task: null,
    done: [],
    buildTurns: [],
    placements: [],
    milestones: [],
    coupons: chapter.coupons.map(
      (c): Coupon => ({
        kind: 'fixed',
        id: c.id,
        from: c.from,
        to: c.to,
        milestone: c.milestone,
        state: 'veiled',
        redeemRequestedAt: null,
        redeemedAt: null,
      }),
    ),
  };
}

/** Zweiter Spieler tritt bei. Liefert null, wenn das Haus schon zwei Spieler hat. */
export function joinHouse(state: HouseState, name: string, ctx: RuleContext): HouseState | null {
  if (state.players.b) return null;
  return advance({ ...state, players: { a: state.players.a, b: { name, joinedAt: ctx.now } } }, ctx);
}

// ---------------------------------------------------------------- Tagesablauf

function freshProgress(task: RulesTask): TaskProgress {
  switch (task.type) {
    case 'puzzle':
      return { type: 'puzzle', solvedBy: null };
    case 'knowme':
      return { type: 'knowme', submissions: {}, hearts: [], judged: [] };
    case 'reallife':
      return { type: 'reallife', confirmedBy: [] };
  }
}

/**
 * Die Aufgabe, die als nächste erscheint: die erste der festen Reihenfolge, die dieses Haus noch nicht erledigt
 * hat. Maßgeblich sind die ids, nicht die Anzahl – ändern sich Reihenfolge oder Bestand der Inhalte, kommt
 * keine erledigte Aufgabe wieder und keine neue fällt weg. null = Kapitel durchgespielt.
 */
export function upcomingTask(state: Pick<HouseState, 'done'>, chapter: RulesChapter): RulesTask | null {
  const done = new Set(state.done.map((d) => d.taskId));
  return chapter.tasks.find((task) => !done.has(task.id)) ?? null;
}

/** Kennen die Inhalte diese laufende Aufgabe noch, und in der Art, in der sie begonnen wurde? */
function stillInContent(task: ActiveTask, chapter: RulesChapter): boolean {
  return chapter.tasks.some((spec) => spec.id === task.taskId && spec.type === task.progress.type);
}

/**
 * Lässt die nächste Aufgabe erscheinen, wenn es so weit ist: Beide sind eingezogen, die laufende Aufgabe ist
 * von beiden erledigt, und seit ihrem Erscheinen hat ein neuer Kalendertag begonnen – höchstens eine neue
 * Aufgabe pro Tag. Wer pausiert, verliert nichts: Eine liegen gebliebene Aufgabe wartet, und ist sie erledigt,
 * rückt die nächste gleich nach. Der Worker ruft das bei jedem Abgleich und einmal am Morgen auf.
 *
 * Eine offene Aufgabe, die es in den Inhalten nicht mehr gibt, kann niemand erledigen: Sie macht sofort der
 * nächsten Platz, sonst hinge das Haus an ihr fest.
 */
export function advance(state: HouseState, ctx: RuleContext): HouseState {
  if (!state.players.b) return state;
  const chapter = chapterOf(state, ctx.content);
  const today = dayKey(ctx.now);
  const task = state.task;
  const orphaned = task !== null && task.completedAt === null && !stillInContent(task, chapter);
  if (task && !orphaned && (task.completedAt === null || today <= task.availableOn)) return state;
  const next = upcomingTask(state, chapter);
  if (!next) return orphaned ? { ...state, task: null } : state;
  return { ...state, task: { taskId: next.id, availableOn: today, progress: freshProgress(next), completedAt: null } };
}

/** Rolle eines Spielers in einem Rätsel. */
export function puzzleRole(task: { lead: Slot }, slot: Slot): PuzzleRole {
  return task.lead === slot ? 'lead' : 'partner';
}

/** Wer bei einer Aufgabe im echten Leben den Erhalt bestätigt: der jeweils andere – richtet sie sich an beide, dann beide. */
export function receiversOf(task: { doer: Slot | 'both' }): Slot[] {
  return task.doer === 'both' ? ['a', 'b'] : [otherSlot(task.doer)];
}

/** Hat dieser Spieler seinen Teil in der App getan? Ein Rätsel lösen beide im Gespräch – das gilt für beide erst mit der Lösung. */
export function hasActed(progress: TaskProgress, slot: Slot): boolean {
  switch (progress.type) {
    case 'puzzle':
      return progress.solvedBy !== null;
    case 'knowme':
      return progress.submissions[slot] !== undefined;
    case 'reallife':
      return progress.confirmedBy.includes(slot);
  }
}

/**
 * Mitteilung "neue Aufgabe" am Morgen: an jeden, der an der heute erschienenen Aufgabe seinen Teil noch nicht
 * getan hat. Weil nur die Aufgabe von heute zählt, bekommt niemand dieselbe Mitteilung zweimal – und nie eine Mahnung.
 */
export function announceTask(state: HouseState, ctx: RuleContext): PushEffect[] {
  const task = state.task;
  if (!state.players.b || !task || task.completedAt !== null || task.availableOn !== dayKey(ctx.now)) return [];
  return (['a', 'b'] as const).filter((slot) => !hasActed(task.progress, slot)).map((to): PushEffect => ({ to, kind: 'new_task' }));
}

/**
 * Meilenstein für einen neu hinterlegten geheimen Gutschein: der nächste noch nicht erreichte, an dem
 * noch kein Gutschein liegt; sind alle belegt, kommt er zum nächsten dazu. null = keiner mehr übrig.
 */
export function milestoneForDeposit(state: { done: unknown[]; coupons: { milestone: number }[] }, chapter: RulesChapter): number | null {
  const upcoming = chapter.milestones.filter((m) => m > state.done.length);
  const free = upcoming.find((m) => !state.coupons.some((c) => c.milestone === m));
  return free ?? upcoming[0] ?? null;
}

// ---------------------------------------------------------------- Plätze und Stücke
// Diese Fragen stellt auch die Oberfläche (aus der Sicht); deshalb nehmen sie nur, was Stand und Sicht gemeinsam haben.

export function spotsOf(chapter: RulesChapter): RulesSpot[] {
  return chapter.rooms.flatMap((room) => room.spots);
}

/** Freie Plätze, auf die das Stück passt. */
export function freeSpotsFor(piece: Pick<RulesPiece, 'fits'>, placements: Placement[], chapter: RulesChapter): RulesSpot[] {
  const taken = new Set(placements.map((p) => p.spotId));
  return spotsOf(chapter).filter((spot) => !taken.has(spot.id) && piece.fits.includes(spot.kind));
}

/**
 * Der Bauzug, der gerade dran ist: der älteste noch nicht abgeschlossene. Bauzüge laufen einer nach dem
 * anderen – so konkurrieren nie zwei gewählte Stücke um denselben letzten Platz.
 */
export function activeTurn(built: Pick<HouseState, 'buildTurns'>): BuildTurn | null {
  return built.buildTurns.find((turn) => turn.placedAt === null) ?? null;
}

/** Findet der offene Bauzug bei diesen Platzierungen noch einen Platz – für das gewählte Stück oder, vor der Wahl, für mindestens eines aus dem Angebot? */
function turnStillFits(turn: BuildTurn | null, placements: Placement[], chapter: RulesChapter): boolean {
  if (!turn) return true;
  const ids = turn.chosen !== null ? [turn.chosen] : turn.offer;
  return ids.some((id) => {
    const piece = chapter.pieces.find((p) => p.id === id);
    return piece !== undefined && freeSpotsFor(piece, placements, chapter).length > 0;
  });
}

/**
 * Plätze, auf die ein Stück umziehen darf (auch das Dekostück beim ersten Aufstellen): frei, passend – und so,
 * dass der offene Bauzug danach noch einen Platz findet. Sonst könnte Umstellen einen Zug für immer blockieren.
 */
export function moveSpotsFor(piece: Pick<RulesPiece, 'id' | 'fits'>, built: Pick<HouseState, 'placements' | 'buildTurns'>, chapter: RulesChapter): RulesSpot[] {
  const turn = activeTurn(built);
  const others = built.placements.filter((p) => p.pieceId !== piece.id);
  return freeSpotsFor(piece, built.placements, chapter).filter((spot) => turnStillFits(turn, [...others, { pieceId: piece.id, spotId: spot.id }], chapter));
}

/** Dekostücke aus Meilenstein-Geschenken, die noch keinen Platz im Haus haben. */
export function unplacedDeco(built: Pick<HouseState, 'placements' | 'milestones'>): string[] {
  const placed = new Set(built.placements.map((p) => p.pieceId));
  return built.milestones.flatMap((m) => (m.decoPiece !== null && !placed.has(m.decoPiece) ? [m.decoPiece] : []));
}

/** Stellt ein Stück auf einen Platz. Liefert die neuen Platzierungen oder den Grund, warum es nicht geht. */
function putPiece(state: HouseState, chapter: RulesChapter, pieceId: string, spotId: string): Placement[] | RejectReason {
  const piece = chapter.pieces.find((p) => p.id === pieceId);
  const spot = spotsOf(chapter).find((s) => s.id === spotId);
  if (!piece || !spot || !piece.fits.includes(spot.kind)) return 'invalid';
  // Besetzt – auch vom Stück selbst: dann hat sich nichts zu ändern.
  if (state.placements.some((p) => p.spotId === spotId)) return 'stale';
  return [...state.placements.filter((p) => p.pieceId !== pieceId), { pieceId, spotId }];
}

// ---------------------------------------------------------------- Erledigte Aufgabe → Bauzug und Meilenstein

/** FNV-1a: macht aus einem Text eine gut gestreute Zahl. Kein Zufall – derselbe Text ergibt dieselbe Zahl. */
function hash(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/**
 * Angebot für Bauzug n: Stücke aus dem Katalog, die noch zu haben sind und gerade irgendwo hinpassen.
 * Die Auswahl hängt nur von Haus und Zugnummer ab – so bleibt die Regel eine reine Funktion und jedes
 * Haus bekommt trotzdem seine eigene Reihenfolge.
 */
function offerFor(state: Pick<HouseState, 'id' | 'placements'>, chapter: RulesChapter, n: number): string[] {
  const placed = new Set(state.placements.map((p) => p.pieceId));
  return chapter.pieces
    .filter((p) => p.milestone === undefined && !placed.has(p.id) && freeSpotsFor(p, state.placements, chapter).length > 0)
    .map((p) => ({ id: p.id, rank: hash(`${state.id}:${n}:${p.id}`) }))
    .sort((x, y) => x.rank - y.rank || (x.id < y.id ? -1 : 1))
    .slice(0, chapter.build.offerSize)
    .map((p) => p.id);
}

/**
 * Gibt dem Bauzug, der jetzt dran ist, sein Angebot. Es entsteht erst in diesem Moment – aus dem, was dann
 * noch zu haben ist und ins Haus passt. Passt nichts mehr, entfällt der Zug und der nächste rückt nach.
 */
function withActiveOffer(state: Pick<HouseState, 'id' | 'placements' | 'buildTurns'>, chapter: RulesChapter): BuildTurn[] {
  const turns = [...state.buildTurns];
  for (;;) {
    const index = turns.findIndex((turn) => turn.placedAt === null);
    const turn = turns[index];
    if (!turn || turn.offer.length > 0) return turns;
    const offer = offerFor(state, chapter, turn.n);
    if (offer.length > 0) {
      turns[index] = { ...turn, offer };
      return turns;
    }
    turns.splice(index, 1);
  }
}

/**
 * Eine Aufgabe ist für beide erledigt: Sie wandert nach `done`, bringt einen Bauzug und öffnet, wenn ihre
 * Nummer ein Meilenstein ist, dessen Geschenk – die dort wartenden Gutscheine oder, liegt keiner dort,
 * das Dekostück dieses Meilensteins. Die Regeln der drei Aufgabentypen rufen das über `finishTask` auf.
 */
export function completeTask(state: HouseState, done: DoneTask, ctx: RuleContext): { state: HouseState; effects: PushEffect[] } {
  const chapter = chapterOf(state, ctx.content);
  const n = state.done.length + 1;
  const effects: PushEffect[] = [];

  // Die Rollen wechseln je Zug. Sein Angebot bekommt der Zug, sobald er dran ist (withActiveOffer).
  const first = chapter.build.firstChooser;
  const turn: BuildTurn = { n, chooser: n % 2 === 1 ? first : otherSlot(first), offer: [], chosen: null, placedAt: null };
  const buildTurns = withActiveOffer({ ...state, buildTurns: [...state.buildTurns, turn] }, chapter);

  let coupons = state.coupons;
  let milestones = state.milestones;
  if (chapter.milestones.includes(n) && !milestones.some((m) => m.at === n)) {
    const opened = new Set(coupons.filter((c) => c.milestone === n && c.state === 'veiled').map((c) => c.id));
    coupons = coupons.map((c): Coupon => (opened.has(c.id) ? { ...c, state: 'unlocked' } : c));
    for (const to of new Set(coupons.filter((c) => opened.has(c.id)).map((c) => c.to))) effects.push({ to, kind: 'coupon_unlocked' });
    const decoPiece = opened.size === 0 ? (chapter.pieces.find((p) => p.milestone === n)?.id ?? null) : null;
    milestones = [...milestones, { at: n, reachedAt: ctx.now, decoPiece, seenBy: [] }];
  }

  return {
    state: {
      ...state,
      done: [...state.done, done],
      buildTurns,
      coupons,
      milestones,
    },
    effects,
  };
}

/**
 * Die laufende Aufgabe ist mit diesem Fortschritt für beide erledigt. Sie bleibt als erledigt stehen, bis die
 * nächste erscheint – lag sie schon seit einem früheren Tag bereit, ist das sofort.
 */
function finishTask(state: HouseState, task: ActiveTask, progress: TaskProgress, ctx: RuleContext): { state: HouseState; effects: PushEffect[] } {
  const closed: HouseState = { ...state, task: { ...task, progress, completedAt: ctx.now } };
  const completed = completeTask(closed, { taskId: task.taskId, completedAt: ctx.now, progress }, ctx);
  return { state: advance(completed.state, ctx), effects: completed.effects };
}

type OpenTask<T extends RulesTask['type']> = {
  task: ActiveTask;
  spec: Extract<RulesTask, { type: T }>;
  progress: Extract<TaskProgress, { type: T }>;
};

/** Die laufende, noch offene Aufgabe – oder der Grund, warum eine Aktion nicht (mehr) zu ihr passt. */
function openTask<T extends RulesTask['type']>(state: HouseState, chapter: RulesChapter, taskId: string, type: T): OpenTask<T> | RejectReason {
  const spec = chapter.tasks.find((t) => t.id === taskId);
  if (!spec || spec.type !== type) return 'invalid';
  const task = state.task;
  // Noch nicht erschienen, schon erledigt oder längst die nächste dran.
  if (!task || task.taskId !== taskId || task.completedAt !== null) return 'stale';
  if (task.progress.type !== type) return 'invalid';
  return { task, spec: spec as Extract<RulesTask, { type: T }>, progress: task.progress as Extract<TaskProgress, { type: T }> };
}

function fitsQuestion(spec: Extract<RulesTask, { type: 'knowme' }>['answer'], answer: KnowMeAnswer): boolean {
  if (spec.kind === 'choice') return answer.kind === 'choice' && answer.option < spec.options.length;
  return answer.kind === 'text' && answer.text.length <= spec.maxLength;
}

// ---------------------------------------------------------------- Aktionen

/**
 * Wendet eine Aktion an. Der Stand wird nie verändert, sondern neu gebaut; bei `rejected` kommt
 * derselbe Stand zurück. Dass jede id höchstens einmal hier ankommt, stellt der Worker sicher.
 */
export function applyAction(state: HouseState, slot: Slot, action: Action, ctx: RuleContext): Applied {
  try {
    return applyRule(state, slot, action, ctx);
  } catch (error) {
    // Scheitert eine Regel an dieser einen Aktion, darf sie nicht jeden weiteren Abgleich blockieren:
    // Die Aktion gilt als abgelehnt und verlässt die Warteschlange, der Stand bleibt, wie er war.
    console.error(`Regel für ${action.type} ist gescheitert`, error);
    return { state, result: { id: action.id, outcome: 'rejected', reason: 'invalid' }, effects: [] };
  }
}

function applyRule(state: HouseState, slot: Slot, action: Action, ctx: RuleContext): Applied {
  const reject = (reason: RejectReason): Applied => ({
    state,
    result: { id: action.id, outcome: 'rejected', reason },
    effects: [],
  });
  const apply = (next: HouseState, effects: PushEffect[] = []): Applied => ({
    state: next,
    result: { id: action.id, outcome: 'applied' },
    // Wer die Aktion selbst ausgelöst hat, sieht das Ergebnis in der App – eine Mitteilung an ihn wäre nur Lärm.
    effects: effects.filter((effect) => effect.to !== slot),
  });

  // Gespielt wird erst zu zweit.
  if (!state.players.b) return reject('invalid');
  const chapter = chapterOf(state, ctx.content);

  switch (action.type) {
    // ---- Bauen: `chooser` wählt aus dem Angebot, der andere stellt das Stück auf.
    case 'build.choose': {
      const turn = state.buildTurns.find((t) => t.n === action.turn);
      if (!turn) return reject('invalid');
      if (turn.chooser !== slot) return reject('forbidden');
      // Abgeschlossen, schon gewählt oder noch nicht dran.
      if (turn !== activeTurn(state) || turn.chosen !== null) return reject('stale');
      const piece = chapter.pieces.find((p) => p.id === action.pieceId);
      if (!piece || !turn.offer.includes(piece.id)) return reject('invalid');
      // Seit dem Angebot kann Umstellen diesem einen Stück den Platz genommen haben (allen aus dem Angebot nie).
      if (freeSpotsFor(piece, state.placements, chapter).length === 0) return reject('stale');
      const buildTurns = state.buildTurns.map((t) => (t === turn ? { ...t, chosen: piece.id } : t));
      return apply({ ...state, buildTurns }, [{ to: otherSlot(slot), kind: 'partner_done' }]);
    }

    case 'build.place': {
      const turn = state.buildTurns.find((t) => t.n === action.turn);
      if (!turn) return reject('invalid');
      if (turn.chooser === slot) return reject('forbidden');
      if (turn !== activeTurn(state) || turn.chosen === null) return reject('stale');
      const placements = putPiece(state, chapter, turn.chosen, action.spotId);
      if (typeof placements === 'string') return reject(placements);
      const finished = state.buildTurns.map((t) => (t === turn ? { ...t, placedAt: action.spotId } : t));
      // Der nächste wartende Zug ist jetzt dran und bekommt sein Angebot.
      const buildTurns = withActiveOffer({ id: state.id, placements, buildTurns: finished }, chapter);
      return apply({ ...state, buildTurns, placements });
    }

    // Umstellen dürfen beide. Dieselbe Aktion bringt auch das Dekostück aus einem Geschenk erstmals ins Haus.
    case 'piece.move': {
      const inHouse = state.placements.some((p) => p.pieceId === action.pieceId) || unplacedDeco(state).includes(action.pieceId);
      if (!inHouse) return reject('invalid');
      const placements = putPiece(state, chapter, action.pieceId, action.spotId);
      if (typeof placements === 'string') return reject(placements);
      // Der offene Bauzug hat Vorrang: Nimmt ihm dieser Platz die letzte Möglichkeit, bleibt alles, wie es ist.
      if (!turnStillFits(activeTurn(state), placements, chapter)) return reject('stale');
      return apply({ ...state, placements });
    }

    // ---- Meilensteine und Gutscheine
    case 'milestone.seen': {
      const milestone = state.milestones.find((m) => m.at === action.milestone);
      if (!milestone) return reject('invalid');
      if (milestone.seenBy.includes(slot)) return apply(state);
      const milestones = state.milestones.map((m) => (m === milestone ? { ...m, seenBy: [...m.seenBy, slot] } : m));
      return apply({ ...state, milestones });
    }

    case 'coupon.deposit': {
      const milestone = milestoneForDeposit(state, chapter);
      if (milestone === null) return reject('invalid');
      const coupon: Coupon = {
        kind: 'secret',
        id: action.id,
        from: slot,
        to: otherSlot(slot),
        milestone,
        state: 'veiled',
        redeemRequestedAt: null,
        redeemedAt: null,
        text: action.text,
      };
      return apply({ ...state, coupons: [...state.coupons, coupon] });
    }

    // Einlösen: Der Empfänger fragt an, der Schenkende bestätigt.
    case 'coupon.requestRedeem': {
      const coupon = state.coupons.find((c) => c.id === action.couponId);
      if (!coupon) return reject('invalid');
      if (coupon.to !== slot) return reject('forbidden');
      if (coupon.state !== 'unlocked' || coupon.redeemRequestedAt !== null) return reject('stale');
      const coupons = state.coupons.map((c): Coupon => (c === coupon ? { ...c, redeemRequestedAt: ctx.now } : c));
      return apply({ ...state, coupons }, [{ to: coupon.from, kind: 'redeem_requested' }]);
    }

    case 'coupon.confirmRedeem': {
      const coupon = state.coupons.find((c) => c.id === action.couponId);
      if (!coupon) return reject('invalid');
      if (coupon.from !== slot) return reject('forbidden');
      if (coupon.state !== 'unlocked' || coupon.redeemRequestedAt === null) return reject('stale');
      const coupons = state.coupons.map((c): Coupon => (c === coupon ? { ...c, state: 'redeemed', redeemedAt: ctx.now } : c));
      return apply({ ...state, coupons });
    }

    // ---- Aufgaben. Jeder Schritt des einen geht als "partner_done" an den anderen.

    // Geprüft hat die Lösung das Gerät des Handelnden; der Server prüft, dass es der Handelnde war.
    case 'puzzle.solve': {
      const open = openTask(state, chapter, action.taskId, 'puzzle');
      if (typeof open === 'string') return reject(open);
      if (!canSolve(open.spec.kind, puzzleRole(open.spec, slot))) return reject('forbidden');
      const finished = finishTask(state, open.task, { type: 'puzzle', solvedBy: slot }, ctx);
      return apply(finished.state, [{ to: otherSlot(slot), kind: 'partner_done' }, ...finished.effects]);
    }

    case 'knowme.submit': {
      const open = openTask(state, chapter, action.taskId, 'knowme');
      if (typeof open === 'string') return reject(open);
      if (open.progress.submissions[slot]) return reject('stale');
      if (!fitsQuestion(open.spec.answer, action.own) || !fitsQuestion(open.spec.answer, action.guess)) return reject('invalid');
      const submissions = { ...open.progress.submissions, [slot]: { own: action.own, guess: action.guess } };
      const effects: PushEffect[] = [{ to: otherSlot(slot), kind: 'partner_done' }];
      const { a, b } = submissions;
      if (!a || !b) return apply({ ...state, task: { ...open.task, progress: { ...open.progress, submissions } } }, effects);
      // Beide haben abgegeben: Die Aufgabe ist erledigt und wird aufgedeckt. Bei Auswahlfragen steht der Treffer
      // damit fest; bei frei getippten Antworten entscheidet der Befragte später selbst (knowme.judge).
      const hit = (guess: KnowMeAnswer, own: KnowMeAnswer) => guess.kind === 'choice' && own.kind === 'choice' && guess.option === own.option;
      const hearts: Slot[] = [...(hit(a.guess, b.own) ? (['a'] as const) : []), ...(hit(b.guess, a.own) ? (['b'] as const) : [])];
      const finished = finishTask(state, open.task, { type: 'knowme', submissions, hearts, judged: [] }, ctx);
      return apply(finished.state, [...effects, ...finished.effects]);
    }

    // Frei getippte Antworten vergleicht niemand automatisch: Wer geantwortet hat, sieht nach dem Aufdecken den
    // Tipp des anderen und sagt, ob er zählt. Die Aufgabe ist da längst erledigt – darauf wartet nichts.
    case 'knowme.judge': {
      const spec = chapter.tasks.find((t) => t.id === action.taskId);
      if (!spec || spec.type !== 'knowme' || spec.answer.kind !== 'text') return reject('invalid');
      const done = state.done.find((d) => d.taskId === action.taskId);
      // Vor dem Aufdecken gibt es nichts zu entscheiden; danach nur einmal.
      if (!done || done.progress.type !== 'knowme' || done.progress.judged.includes(slot)) return reject('stale');
      const progress: TaskProgress = {
        ...done.progress,
        judged: [...done.progress.judged, slot],
        hearts: action.counts ? [...done.progress.hearts, otherSlot(slot)] : done.progress.hearts,
      };
      return apply({
        ...state,
        done: state.done.map((d) => (d === done ? { ...d, progress } : d)),
        // Steht die Aufgabe noch als erledigte aktuelle da, bleibt ihr Fortschritt derselbe.
        task: state.task?.taskId === action.taskId ? { ...state.task, progress } : state.task,
      });
    }

    // Erledigt wird außerhalb der App; es zählt, dass der Empfänger den Erhalt bestätigt.
    case 'reallife.confirm': {
      const open = openTask(state, chapter, action.taskId, 'reallife');
      if (typeof open === 'string') return reject(open);
      const receivers = receiversOf(open.spec);
      if (!receivers.includes(slot)) return reject('forbidden');
      if (open.progress.confirmedBy.includes(slot)) return reject('stale');
      const progress: TaskProgress = { type: 'reallife', confirmedBy: [...open.progress.confirmedBy, slot] };
      const effects: PushEffect[] = [{ to: otherSlot(slot), kind: 'partner_done' }];
      if (!receivers.every((receiver) => progress.confirmedBy.includes(receiver))) {
        return apply({ ...state, task: { ...open.task, progress } }, effects);
      }
      const finished = finishTask(state, open.task, progress, ctx);
      return apply(finished.state, [...effects, ...finished.effects]);
    }

    // Aus der Bauphase; siehe actions.ts.
    case 'test.completeTask':
      return reject('forbidden');
  }
}
