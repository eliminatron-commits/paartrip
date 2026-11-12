import { describe, expect, it, vi } from 'vitest';
import generated from '../generated/content-rules.json';
import type { Action } from './actions.ts';
import type { RulesContent } from './content-schema.ts';
import type { HouseState } from './model.ts';
import { applyAction, createHouse, joinHouse, milestoneForDeposit, type RuleContext } from './rules.ts';

const content = generated as unknown as RulesContent;
const ctx: RuleContext = { content, now: '2026-11-11T10:00:00.000Z' };
const chapter = content.chapters[0]!;

let n = 0;
function deposit(text: string): Action {
  n += 1;
  return { type: 'coupon.deposit', text, id: `action-${String(n).padStart(4, '0')}`, at: ctx.now };
}

function paired(): HouseState {
  const state = joinHouse(createHouse('house-1', 'Ada', ctx), 'Bao', ctx);
  if (!state) throw new Error('Beitritt fehlgeschlagen');
  return state;
}

/** Stand mit `count` erledigten Aufgaben (nur die Anzahl zählt für die Meilensteine). */
function withDone(state: HouseState, count: number): HouseState {
  const done = Array.from({ length: count }, (_, i) => ({
    taskId: `t${i}`,
    completedAt: ctx.now,
    progress: { type: 'puzzle' as const, solvedBy: 'a' as const },
  }));
  return { ...state, done };
}

describe('Haus anlegen und beitreten', () => {
  it('ein neues Haus hat Spieler a, keinen zweiten Spieler und die festen Gutscheine verhüllt', () => {
    const state = createHouse('house-1', 'Ada', ctx);
    expect(state.players).toEqual({ a: { name: 'Ada', joinedAt: ctx.now }, b: null });
    expect(state.chapter).toBe(chapter.number);
    expect(state.coupons.map((c) => c.id)).toEqual(chapter.coupons.map((c) => c.id));
    expect(state.coupons.every((c) => c.kind === 'fixed' && c.state === 'veiled')).toBe(true);
    // Der Text der festen Gutscheine steht in den Inhalten, nicht im Stand.
    expect(JSON.stringify(state)).not.toContain(chapter.coupons[0]!.text);
  });

  it('der zweite Spieler tritt bei, ein dritter nicht', () => {
    const one = createHouse('house-1', 'Ada', ctx);
    const two = joinHouse(one, 'Bao', { ...ctx, now: '2026-11-11T11:00:00.000Z' });
    expect(two?.players.b).toEqual({ name: 'Bao', joinedAt: '2026-11-11T11:00:00.000Z' });
    expect(one.players.b).toBeNull();
    expect(joinHouse(two!, 'Cleo', ctx)).toBeNull();
  });
});

describe('Aktionen anwenden', () => {
  it('ein geheimer Gutschein geht vom Absender an den anderen und trägt die id der Aktion', () => {
    const state = paired();
    const action = deposit('Breakfast in bed');
    const applied = applyAction(state, 'b', action, ctx);
    expect(applied.result).toEqual({ id: action.id, outcome: 'applied' });
    expect(applied.state.coupons.at(-1)).toMatchObject({ kind: 'secret', id: action.id, from: 'b', to: 'a', state: 'veiled', text: 'Breakfast in bed' });
    // Der alte Stand bleibt unberührt.
    expect(state.coupons).toHaveLength(chapter.coupons.length);
  });

  it('scheitert eine Regel, gilt die Aktion als abgelehnt und der Stand bleibt – kein Abgleich hängt daran fest', () => {
    // Ein Kapitel, das es in den Inhalten nicht gibt: Die Regel kann den Meilenstein nicht bestimmen und wirft.
    const broken: HouseState = { ...paired(), chapter: chapter.number + 1000 };
    const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const action = deposit('Lost in a missing chapter');
    const applied = applyAction(broken, 'a', action, ctx);
    expect(applied.result).toEqual({ id: action.id, outcome: 'rejected', reason: 'invalid' });
    expect(applied.state).toBe(broken);
    expect(applied.effects).toEqual([]);
    expect(logged).toHaveBeenCalledOnce();
    logged.mockRestore();
  });

  it('solange der zweite Spieler fehlt, wird jede Aktion abgelehnt', () => {
    const alone = createHouse('house-1', 'Ada', ctx);
    const applied = applyAction(alone, 'a', deposit('Too early'), ctx);
    expect(applied.result).toMatchObject({ outcome: 'rejected', reason: 'invalid' });
    expect(applied.state).toBe(alone);
    expect(applied.effects).toEqual([]);
  });
});

describe('Meilenstein für geheime Gutscheine', () => {
  // Erwartung aus den Inhalten abgeleitet: frei ist ein Meilenstein, an dem kein fester Gutschein liegt.
  const fixedAt = new Set(chapter.coupons.map((c) => c.milestone));
  const free = chapter.milestones.filter((m) => !fixedAt.has(m));

  it('der erste wartet am nächsten freien Meilenstein, weitere an den folgenden freien', () => {
    let state = paired();
    const assigned: number[] = [];
    for (let i = 0; i < free.length; i++) {
      state = applyAction(state, 'a', deposit(`gift ${i}`), ctx).state;
      assigned.push(state.coupons.at(-1)!.milestone);
    }
    expect(assigned).toEqual(free);
  });

  it('sind alle belegt, kommt er zum nächsten Meilenstein dazu', () => {
    let state = paired();
    for (let i = 0; i < free.length; i++) state = applyAction(state, 'a', deposit(`gift ${i}`), ctx).state;
    expect(milestoneForDeposit(state, chapter)).toBe(chapter.milestones[0]);
  });

  it('erreichte Meilensteine kommen nicht mehr in Frage', () => {
    const first = chapter.milestones[0]!;
    const state = withDone(paired(), first);
    const next = milestoneForDeposit(state, chapter);
    expect(next).not.toBeNull();
    expect(next!).toBeGreaterThan(first);
  });

  it('nach dem letzten Meilenstein wird das Hinterlegen abgelehnt', () => {
    const state = withDone(paired(), chapter.milestones.at(-1)!);
    expect(milestoneForDeposit(state, chapter)).toBeNull();
    expect(applyAction(state, 'a', deposit('late'), ctx).result).toMatchObject({ outcome: 'rejected' });
  });
});
