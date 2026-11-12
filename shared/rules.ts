// Spielregeln als reine Funktionen: Stand + Aktion + Inhalte + Serverzeit → neuer Stand.
// Kein Zugriff auf Datenbank, Netz oder Gerätezeit – so prüft Vitest jede Regel ohne Worker.
// Der Worker lädt den Stand, ruft diese Funktionen auf und speichert das Ergebnis.
import type { Action, ActionResult, RejectReason } from './actions.ts';
import type { PushKind } from './api.ts';
import type { RulesChapter, RulesContent } from './content-schema.ts';
import { type Coupon, type HouseState, type IsoTime, otherSlot, type Slot } from './model.ts';

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
export function milestoneForDeposit(state: HouseState, chapter: RulesChapter): number | null {
  const upcoming = chapter.milestones.filter((m) => m > state.done.length);
  const free = upcoming.find((m) => !state.coupons.some((c) => c.milestone === m));
  return free ?? upcoming[0] ?? null;
}

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
    effects,
  });

  // Gespielt wird erst zu zweit.
  if (!state.players.b) return reject('invalid');
  const chapter = chapterOf(state, ctx.content);

  switch (action.type) {
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

    // Regeln für Aufgaben, Bauzüge, Meilensteine und das Einlösen folgen in Phase 3 und 4.
    // Bis dahin lehnt der Server diese Aktionen ab, statt sie ungeprüft anzunehmen.
    case 'puzzle.solve':
    case 'knowme.submit':
    case 'reallife.confirm':
    case 'build.choose':
    case 'build.place':
    case 'piece.move':
    case 'milestone.seen':
    case 'coupon.requestRedeem':
    case 'coupon.confirmRedeem':
      return reject('invalid');
  }
}
