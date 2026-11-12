// Spielregeln als reine Funktionen: Stand + Aktion + Inhalte + Serverzeit → neuer Stand.
// Kein Zugriff auf Datenbank, Netz oder Gerätezeit – so prüft Vitest jede Regel ohne Worker.
// Der Worker lädt den Stand, ruft diese Funktionen auf und speichert das Ergebnis.
import type { Action, ActionResult, RejectReason } from './actions.ts';
import type { PushKind } from './api.ts';
import type { RulesChapter, RulesContent } from './content-schema.ts';
import {
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

export interface RuleContext {
  content: RulesContent;
  /** Serverzeit. */
  now: IsoTime;
  /** Test-Aktionen annehmen (lokal und in der Bauphase); sonst lehnt der Server sie ab. */
  testActions?: boolean;
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
    // Die erste Aufgabe erscheint mit dem Aufgabenablauf (Phase 4).
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
  return { ...state, players: { a: state.players.a, b: { name, joinedAt: ctx.now } } };
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
function offerFor(state: HouseState, chapter: RulesChapter, n: number): string[] {
  const placed = new Set(state.placements.map((p) => p.pieceId));
  // In offenen Zügen gebunden: das gewählte Stück oder, solange nicht gewählt ist, das ganze Angebot.
  const held = new Set(state.buildTurns.filter((t) => t.placedAt === null).flatMap((t) => (t.chosen !== null ? [t.chosen] : t.offer)));
  return chapter.pieces
    .filter((p) => p.milestone === undefined && !placed.has(p.id) && !held.has(p.id) && freeSpotsFor(p, state.placements, chapter).length > 0)
    .map((p) => ({ id: p.id, rank: hash(`${state.id}:${n}:${p.id}`) }))
    .sort((x, y) => x.rank - y.rank || (x.id < y.id ? -1 : 1))
    .slice(0, chapter.build.offerSize)
    .map((p) => p.id);
}

/**
 * Eine Aufgabe ist für beide erledigt: Sie wandert nach `done`, bringt einen Bauzug und öffnet, wenn ihre
 * Nummer ein Meilenstein ist, dessen Geschenk – die dort wartenden Gutscheine oder, liegt keiner dort,
 * das Dekostück dieses Meilensteins. Der Aufgabenablauf (Phase 4) ruft das aus seinen Regeln auf.
 */
export function completeTask(state: HouseState, done: DoneTask, ctx: RuleContext): { state: HouseState; effects: PushEffect[] } {
  const chapter = chapterOf(state, ctx.content);
  const n = state.done.length + 1;
  const effects: PushEffect[] = [];

  // Die Rollen wechseln je Zug. Ist nichts mehr zu vergeben, entfällt der Zug.
  const offer = offerFor(state, chapter, n);
  const first = chapter.build.firstChooser;
  const turn: BuildTurn = { n, chooser: n % 2 === 1 ? first : otherSlot(first), offer, chosen: null, placedAt: null };

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
      buildTurns: offer.length > 0 ? [...state.buildTurns, turn] : state.buildTurns,
      coupons,
      milestones,
    },
    effects,
  };
}

/**
 * Nur für die Bauphase (Aktion test.completeTask): die nächste Aufgabe der Reihenfolge so, als hätten beide
 * sie erledigt. Bei Kennst-du-mich mit Antworten, damit Erinnerungsstücke entstehen. Entfällt mit Phase 4.
 */
function testDone(state: HouseState, chapter: RulesChapter, now: IsoTime): DoneTask {
  const n = state.done.length;
  const task = chapter.tasks[n % chapter.tasks.length];
  if (!task) throw new Error('Kapitel ohne Aufgaben');
  let progress: TaskProgress;
  switch (task.type) {
    case 'puzzle':
      progress = { type: 'puzzle', solvedBy: task.lead };
      break;
    case 'reallife':
      progress = { type: 'reallife', confirmedBy: task.doer === 'both' ? ['a', 'b'] : [otherSlot(task.doer)] };
      break;
    case 'knowme': {
      const spec = task.answer;
      const answer = (i: number): KnowMeAnswer =>
        spec.kind === 'choice' ? { kind: 'choice', option: i % spec.options.length } : { kind: 'text', text: `Test answer ${i + 1}` };
      // a tippt richtig und bekommt ein Herz, b tippt daneben.
      progress = {
        type: 'knowme',
        submissions: { a: { own: answer(n), guess: answer(n + 1) }, b: { own: answer(n + 1), guess: answer(n + 1) } },
        hearts: ['a'],
      };
      break;
    }
  }
  return { taskId: task.id, completedAt: now, progress };
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
      if (turn.chosen !== null) return reject('stale');
      const piece = chapter.pieces.find((p) => p.id === action.pieceId);
      if (!piece || !turn.offer.includes(piece.id)) return reject('invalid');
      // Inzwischen kann ein anderer Zug den letzten passenden Platz belegt haben.
      if (freeSpotsFor(piece, state.placements, chapter).length === 0) return reject('stale');
      const buildTurns = state.buildTurns.map((t) => (t === turn ? { ...t, chosen: piece.id } : t));
      return apply({ ...state, buildTurns }, [{ to: otherSlot(slot), kind: 'partner_done' }]);
    }

    case 'build.place': {
      const turn = state.buildTurns.find((t) => t.n === action.turn);
      if (!turn) return reject('invalid');
      if (turn.chooser === slot) return reject('forbidden');
      if (turn.chosen === null || turn.placedAt !== null) return reject('stale');
      const placements = putPiece(state, chapter, turn.chosen, action.spotId);
      if (typeof placements === 'string') return reject(placements);
      const buildTurns = state.buildTurns.map((t) => (t === turn ? { ...t, placedAt: action.spotId } : t));
      return apply({ ...state, buildTurns, placements });
    }

    // Umstellen dürfen beide. Dieselbe Aktion bringt auch das Dekostück aus einem Geschenk erstmals ins Haus.
    case 'piece.move': {
      const inHouse = state.placements.some((p) => p.pieceId === action.pieceId) || unplacedDeco(state).includes(action.pieceId);
      if (!inHouse) return reject('invalid');
      const placements = putPiece(state, chapter, action.pieceId, action.spotId);
      if (typeof placements === 'string') return reject(placements);
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

    // ---- Bauphase
    case 'test.completeTask': {
      if (!ctx.testActions) return reject('forbidden');
      // Mehr als das Kapitel hergibt, soll auch im Test nicht entstehen.
      if (state.done.length >= (chapter.milestones.at(-1) ?? 0)) return reject('stale');
      const completed = completeTask(state, testDone(state, chapter, ctx.now), ctx);
      return apply(completed.state, completed.effects);
    }

    // Die Regeln für Aufgaben folgen mit dem Aufgabenablauf in Phase 4.
    // Bis dahin lehnt der Server diese Aktionen ab, statt sie ungeprüft anzunehmen.
    case 'puzzle.solve':
    case 'knowme.submit':
    case 'reallife.confirm':
      return reject('invalid');
  }
}
