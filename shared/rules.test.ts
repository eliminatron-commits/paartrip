import { describe, expect, it, vi } from 'vitest';
import generated from '../generated/content-rules.json';
import type { Action, ActionBody } from './actions.ts';
import type { RulesContent } from './content-schema.ts';
import { type HouseState, otherSlot, type Slot } from './model.ts';
import { applyAction, createHouse, freeSpotsFor, joinHouse, milestoneForDeposit, type RuleContext, spotsOf, unplacedDeco } from './rules.ts';

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

// ---------------------------------------------------------------- Bauzug, Meilenstein, Einlösen

const testCtx: RuleContext = { ...ctx, testActions: true };

function act(body: ActionBody): Action {
  n += 1;
  return { ...body, id: `action-${String(n).padStart(4, '0')}`, at: ctx.now } as Action;
}

/** Wendet eine Aktion an und verlangt, dass sie gilt. */
function play(state: HouseState, slot: Slot, body: ActionBody): HouseState {
  const applied = applyAction(state, slot, act(body), testCtx);
  expect(applied.result, JSON.stringify(body)).toMatchObject({ outcome: 'applied' });
  return applied.state;
}

/** Erledigt `count` Aufgaben über die Test-Aktion. */
function complete(state: HouseState, count = 1): HouseState {
  for (let i = 0; i < count; i++) state = play(state, 'a', { type: 'test.completeTask' });
  return state;
}

const piece = (id: string) => chapter.pieces.find((p) => p.id === id)!;
const turnOf = (state: HouseState, turn: number) => state.buildTurns.find((t) => t.n === turn)!;

/** Spielt Bauzug `turn` zu Ende: Der Wählende nimmt das erste Angebot, der andere den ersten passenden freien Platz. */
function finishTurn(state: HouseState, turn: number): HouseState {
  const { chooser, offer } = turnOf(state, turn);
  state = play(state, chooser, { type: 'build.choose', turn, pieceId: offer[0]! });
  const spot = freeSpotsFor(piece(offer[0]!), state.placements, chapter)[0]!;
  return play(state, otherSlot(chooser), { type: 'build.place', turn, spotId: spot.id });
}

describe('Erledigte Aufgabe', () => {
  it('bringt einen Bauzug mit Angebot aus dem Katalog; die Rollen wechseln je Zug', () => {
    const state = complete(paired(), 2);
    expect(state.done).toHaveLength(2);
    expect(state.buildTurns.map((t) => t.n)).toEqual([1, 2]);
    const first = chapter.build.firstChooser;
    expect(state.buildTurns.map((t) => t.chooser)).toEqual([first, otherSlot(first)]);
    for (const turn of state.buildTurns) {
      expect(turn).toMatchObject({ chosen: null, placedAt: null });
      expect(turn.offer).toHaveLength(chapter.build.offerSize);
      expect(new Set(turn.offer).size).toBe(turn.offer.length);
      // Nur normale Stücke: Die Dekostücke der Meilensteine kommen nie ins Angebot.
      expect(turn.offer.every((id) => piece(id) !== undefined && piece(id).milestone === undefined)).toBe(true);
    }
  });

  it('solange ein Zug offen ist, wird keines seiner Stücke noch einmal angeboten', () => {
    const state = complete(paired(), 2);
    const [one, two] = state.buildTurns;
    expect(two!.offer.filter((id) => one!.offer.includes(id))).toEqual([]);
  });

  it('platzierte Stücke werden nie wieder angeboten', () => {
    let state = finishTurn(complete(paired()), 1);
    const placed = state.placements.map((p) => p.pieceId);
    for (let i = 0; i < 4; i++) {
      state = complete(state);
      const turn = state.buildTurns.at(-1)!;
      expect(turn.offer.filter((id) => placed.includes(id))).toEqual([]);
      state = finishTurn(state, turn.n);
      placed.push(state.placements.at(-1)!.pieceId);
    }
    expect(new Set(placed).size).toBe(placed.length);
  });

  it('dasselbe Haus bekommt für denselben Zug dasselbe Angebot, andere Häuser nicht alle dasselbe', () => {
    expect(complete(paired()).buildTurns[0]!.offer).toEqual(complete(paired()).buildTurns[0]!.offer);
    const houses = ['house-1', 'house-2', 'house-3', 'house-4', 'house-5', 'house-6'];
    const offers = new Set(houses.map((id) => complete({ ...paired(), id }).buildTurns[0]!.offer.join()));
    expect(offers.size).toBeGreaterThan(1);
  });

  it('Test-Aufgaben nimmt der Server nur an, wenn sie eingeschaltet sind', () => {
    const state = paired();
    const applied = applyAction(state, 'a', act({ type: 'test.completeTask' }), ctx);
    expect(applied.result).toMatchObject({ outcome: 'rejected', reason: 'forbidden' });
    expect(applied.state).toBe(state);
  });

  it('mehr Aufgaben, als das Kapitel Meilensteine hergibt, entstehen auch im Test nicht', () => {
    const full = withDone(paired(), chapter.milestones.at(-1)!);
    expect(applyAction(full, 'a', act({ type: 'test.completeTask' }), testCtx).result).toMatchObject({ outcome: 'rejected', reason: 'stale' });
  });

  it('ist kein Platz mehr frei, entfällt der Bauzug – die Aufgabe zählt trotzdem', () => {
    const full: HouseState = { ...paired(), placements: spotsOf(chapter).map((s, i) => ({ pieceId: `filler-${i}`, spotId: s.id })) };
    const state = complete(full);
    expect(state.done).toHaveLength(1);
    expect(state.buildTurns).toEqual([]);
  });
});

describe('Bauzug', () => {
  it('einer wählt, der andere platziert – danach steht das Stück im Haus', () => {
    let state = complete(paired());
    const { chooser, offer } = turnOf(state, 1);
    const placer = otherSlot(chooser);
    const chosen = offer[1]!;

    const choosing = applyAction(state, chooser, act({ type: 'build.choose', turn: 1, pieceId: chosen }), testCtx);
    expect(choosing.result).toMatchObject({ outcome: 'applied' });
    // Der andere erfährt, dass er an der Reihe ist.
    expect(choosing.effects).toEqual([{ to: placer, kind: 'partner_done' }]);
    state = choosing.state;
    expect(turnOf(state, 1)).toMatchObject({ chosen, placedAt: null });
    expect(state.placements).toEqual([]);

    const spot = freeSpotsFor(piece(chosen), state.placements, chapter)[0]!;
    state = play(state, placer, { type: 'build.place', turn: 1, spotId: spot.id });
    expect(turnOf(state, 1)).toMatchObject({ chosen, placedAt: spot.id });
    expect(state.placements).toEqual([{ pieceId: chosen, spotId: spot.id }]);
  });

  it('die falsche Rolle wird abgelehnt', () => {
    let state = complete(paired());
    const { chooser, offer } = turnOf(state, 1);
    const placer = otherSlot(chooser);
    expect(applyAction(state, placer, act({ type: 'build.choose', turn: 1, pieceId: offer[0]! }), testCtx).result).toMatchObject({ reason: 'forbidden' });
    state = play(state, chooser, { type: 'build.choose', turn: 1, pieceId: offer[0]! });
    const spot = freeSpotsFor(piece(offer[0]!), state.placements, chapter)[0]!;
    expect(applyAction(state, chooser, act({ type: 'build.place', turn: 1, spotId: spot.id }), testCtx).result).toMatchObject({ reason: 'forbidden' });
  });

  it('gewählt wird nur aus dem Angebot und nur einmal; platziert wird erst nach dem Wählen', () => {
    let state = complete(paired());
    const { chooser, offer } = turnOf(state, 1);
    const placer = otherSlot(chooser);
    const outside = chapter.pieces.find((p) => !offer.includes(p.id))!;
    const anySpot = spotsOf(chapter)[0]!;

    expect(applyAction(state, chooser, act({ type: 'build.choose', turn: 1, pieceId: outside.id }), testCtx).result).toMatchObject({ reason: 'invalid' });
    expect(applyAction(state, chooser, act({ type: 'build.choose', turn: 99, pieceId: offer[0]! }), testCtx).result).toMatchObject({ reason: 'invalid' });
    expect(applyAction(state, placer, act({ type: 'build.place', turn: 1, spotId: anySpot.id }), testCtx).result).toMatchObject({ reason: 'stale' });

    state = play(state, chooser, { type: 'build.choose', turn: 1, pieceId: offer[0]! });
    expect(applyAction(state, chooser, act({ type: 'build.choose', turn: 1, pieceId: offer[1]! }), testCtx).result).toMatchObject({ reason: 'stale' });
    expect(turnOf(state, 1).chosen).toBe(offer[0]);
  });

  it('ein unpassender, ein unbekannter und ein besetzter Platz werden abgelehnt', () => {
    let state = finishTurn(complete(paired(), 2), 1);
    const taken = state.placements[0]!.spotId;
    const { chooser, offer } = turnOf(state, 2);
    const placer = otherSlot(chooser);
    state = play(state, chooser, { type: 'build.choose', turn: 2, pieceId: offer[0]! });
    const chosen = piece(offer[0]!);
    const wrongKind = spotsOf(chapter).find((s) => !chosen.fits.includes(s.kind))!;
    const place = (spotId: string) => applyAction(state, placer, act({ type: 'build.place', turn: 2, spotId }), testCtx);

    expect(place(wrongKind.id).result).toMatchObject({ reason: 'invalid' });
    expect(place('no-such-spot').result).toMatchObject({ reason: 'invalid' });
    // Besetzt zählt erst, wenn das Stück dort überhaupt hinpasste – sonst ist schon die Platzart falsch.
    const takenKind = spotsOf(chapter).find((s) => s.id === taken)!.kind;
    expect(place(taken).result).toMatchObject({ reason: chosen.fits.includes(takenKind) ? 'stale' : 'invalid' });
    expect(place(taken).state).toBe(state);
  });

  it('ein besetzter Platz ist für ein passendes Stück vergeben', () => {
    // Zwei Stücke derselben Platzart: Das zweite darf nicht auf den Platz des ersten.
    let state = complete(paired());
    const first = turnOf(state, 1);
    state = finishTurn(state, 1);
    const { pieceId, spotId } = state.placements[0]!;
    const kind = spotsOf(chapter).find((s) => s.id === spotId)!.kind;
    const rival = chapter.pieces.find((p) => p.id !== pieceId && p.milestone === undefined && p.fits.includes(kind))!;
    // Ein offener Zug, in dem genau dieses Stück gewählt ist.
    const open: HouseState = { ...state, buildTurns: [...state.buildTurns, { n: 2, chooser: first.chooser, offer: [rival.id], chosen: rival.id, placedAt: null }] };
    const applied = applyAction(open, otherSlot(first.chooser), act({ type: 'build.place', turn: 2, spotId }), testCtx);
    expect(applied.result).toMatchObject({ outcome: 'rejected', reason: 'stale' });
    expect(applied.state.placements).toEqual([{ pieceId, spotId }]);
  });

  it('ein abgeschlossener Zug nimmt nichts mehr an', () => {
    const state = finishTurn(complete(paired()), 1);
    const free = spotsOf(chapter).find((s) => s.id !== state.placements[0]!.spotId)!;
    const placer = otherSlot(turnOf(state, 1).chooser);
    expect(applyAction(state, placer, act({ type: 'build.place', turn: 1, spotId: free.id }), testCtx).result).toMatchObject({ reason: 'stale' });
  });

  it('umstellen dürfen beide; der alte Platz wird frei', () => {
    let state = finishTurn(complete(paired()), 1);
    const { pieceId, spotId: from } = state.placements[0]!;
    const to = freeSpotsFor(piece(pieceId), state.placements, chapter)[0]!;
    state = play(state, 'a', { type: 'piece.move', pieceId, spotId: to.id });
    expect(state.placements).toEqual([{ pieceId, spotId: to.id }]);
    // Der ursprüngliche Platz ist wieder zu haben – der andere stellt das Stück dorthin zurück.
    expect(freeSpotsFor(piece(pieceId), state.placements, chapter).map((s) => s.id)).toContain(from);
    state = play(state, 'b', { type: 'piece.move', pieceId, spotId: from });
    expect(state.placements).toEqual([{ pieceId, spotId: from }]);
    // Der eigene Platz als Ziel ändert nichts.
    expect(applyAction(state, 'a', act({ type: 'piece.move', pieceId, spotId: from }), testCtx).result).toMatchObject({ reason: 'stale' });
  });

  it('was nicht im Haus steht, lässt sich nicht umstellen', () => {
    const state = complete(paired());
    const offered = turnOf(state, 1).offer[0]!;
    const spot = freeSpotsFor(piece(offered), state.placements, chapter)[0]!;
    expect(applyAction(state, 'a', act({ type: 'piece.move', pieceId: offered, spotId: spot.id }), testCtx).result).toMatchObject({ reason: 'invalid' });
    expect(applyAction(state, 'a', act({ type: 'piece.move', pieceId: 'no-such-piece', spotId: spot.id }), testCtx).result).toMatchObject({ reason: 'invalid' });
  });
});

describe('Meilenstein', () => {
  const fixedAt = new Set(chapter.coupons.map((c) => c.milestone));
  const free = chapter.milestones.find((m) => !fixedAt.has(m))!;
  const fixed = chapter.coupons[0]!;
  const deco = chapter.pieces.find((p) => p.milestone === free);

  it('vor dem Meilenstein bleibt alles verhüllt; mit ihm werden die dort wartenden Gutscheine freigeschaltet', () => {
    let state = play(paired(), 'b', { type: 'coupon.deposit', text: 'A walk at sunrise' });
    const secret = state.coupons.at(-1)!;
    expect(secret.milestone).toBe(free);

    state = complete(state, free - 1);
    expect(state.milestones).toEqual([]);
    expect(state.coupons.every((c) => c.state === 'veiled')).toBe(true);

    const reached = applyAction(state, 'a', act({ type: 'test.completeTask' }), testCtx);
    expect(reached.state.milestones).toEqual([{ at: free, reachedAt: ctx.now, decoPiece: null, seenBy: [] }]);
    expect(reached.state.coupons.find((c) => c.id === secret.id)).toMatchObject({ state: 'unlocked' });
    // Nur was an diesem Meilenstein liegt, geht auf.
    expect(reached.state.coupons.filter((c) => c.milestone !== free).every((c) => c.state === 'veiled')).toBe(true);
    // Der Beschenkte bekommt die Mitteilung.
    expect(reached.effects).toEqual([{ to: 'a', kind: 'coupon_unlocked' }]);
  });

  it('ein fester Gutschein wird an seinem Meilenstein freigeschaltet', () => {
    const state = complete(paired(), fixed.milestone);
    expect(state.coupons.find((c) => c.id === fixed.id)).toMatchObject({ state: 'unlocked' });
    expect(state.milestones.find((m) => m.at === fixed.milestone)).toMatchObject({ decoPiece: null });
  });

  it('liegt kein Gutschein dort, enthält das Geschenk das Dekostück dieses Meilensteins', () => {
    // Fehlt das Dekostück in den Inhalten, schlägt der Test fehl, statt still durchzulaufen.
    expect(deco, `Dekostück für Meilenstein ${free} fehlt in den Inhalten`).toBeDefined();
    const reached = applyAction(complete(paired(), free - 1), 'a', act({ type: 'test.completeTask' }), testCtx);
    expect(reached.state.milestones).toEqual([{ at: free, reachedAt: ctx.now, decoPiece: deco!.id, seenBy: [] }]);
    expect(reached.effects).toEqual([]);
  });

  it('das Dekostück stellt auf, wer zuerst kommt; danach lässt es sich wie jedes Stück umstellen', () => {
    let state = complete(paired(), free);
    expect(unplacedDeco(state)).toEqual([deco!.id]);

    const [first, second] = freeSpotsFor(deco!, state.placements, chapter);
    state = play(state, 'b', { type: 'piece.move', pieceId: deco!.id, spotId: first!.id });
    expect(unplacedDeco(state)).toEqual([]);
    expect(state.placements).toContainEqual({ pieceId: deco!.id, spotId: first!.id });
    state = play(state, 'a', { type: 'piece.move', pieceId: deco!.id, spotId: second!.id });
    expect(state.placements.filter((p) => p.pieceId === deco!.id)).toEqual([{ pieceId: deco!.id, spotId: second!.id }]);
  });

  it('ein Dekostück, dessen Meilenstein noch nicht erreicht ist, kommt nicht ins Haus', () => {
    const state = complete(paired(), free - 1);
    const spot = freeSpotsFor(deco!, state.placements, chapter)[0]!;
    expect(applyAction(state, 'a', act({ type: 'piece.move', pieceId: deco!.id, spotId: spot.id }), testCtx).result).toMatchObject({ reason: 'invalid' });
  });

  it('jeder merkt für sich, dass er Szene und Geschenk gesehen hat', () => {
    let state = complete(paired(), free);
    state = play(state, 'b', { type: 'milestone.seen', milestone: free });
    expect(state.milestones[0]!.seenBy).toEqual(['b']);
    // Ein zweites Mal ändert nichts.
    expect(play(state, 'b', { type: 'milestone.seen', milestone: free }).milestones[0]!.seenBy).toEqual(['b']);
    state = play(state, 'a', { type: 'milestone.seen', milestone: free });
    expect(state.milestones[0]!.seenBy).toEqual(['b', 'a']);
    expect(applyAction(state, 'a', act({ type: 'milestone.seen', milestone: free + 1 }), testCtx).result).toMatchObject({ reason: 'invalid' });
  });
});

describe('Einlösen', () => {
  const fixed = chapter.coupons[0]!;
  const unlocked = () => complete(paired(), fixed.milestone);

  it('durchläuft verhüllt → freigeschaltet → angefragt → eingelöst', () => {
    let state = paired();
    const request = { type: 'coupon.requestRedeem', couponId: fixed.id } as const;
    const confirm = { type: 'coupon.confirmRedeem', couponId: fixed.id } as const;
    const coupon = () => state.coupons.find((c) => c.id === fixed.id)!;

    // Verhüllt: Es gibt noch nichts einzulösen.
    expect(applyAction(state, fixed.to, act(request), testCtx).result).toMatchObject({ reason: 'stale' });

    state = unlocked();
    expect(coupon()).toMatchObject({ state: 'unlocked', redeemRequestedAt: null, redeemedAt: null });
    // Bestätigen kann der Schenkende erst nach der Anfrage.
    expect(applyAction(state, fixed.from, act(confirm), testCtx).result).toMatchObject({ reason: 'stale' });

    const requested = applyAction(state, fixed.to, act(request), testCtx);
    expect(requested.effects).toEqual([{ to: fixed.from, kind: 'redeem_requested' }]);
    state = requested.state;
    expect(coupon()).toMatchObject({ state: 'unlocked', redeemRequestedAt: ctx.now, redeemedAt: null });
    expect(applyAction(state, fixed.to, act(request), testCtx).result).toMatchObject({ reason: 'stale' });

    state = play(state, fixed.from, confirm);
    expect(coupon()).toMatchObject({ state: 'redeemed', redeemedAt: ctx.now });
    expect(applyAction(state, fixed.from, act(confirm), testCtx).result).toMatchObject({ reason: 'stale' });
  });

  it('anfragen darf nur der Beschenkte, bestätigen nur der Schenkende', () => {
    let state = unlocked();
    expect(applyAction(state, fixed.from, act({ type: 'coupon.requestRedeem', couponId: fixed.id }), testCtx).result).toMatchObject({ reason: 'forbidden' });
    state = play(state, fixed.to, { type: 'coupon.requestRedeem', couponId: fixed.id });
    expect(applyAction(state, fixed.to, act({ type: 'coupon.confirmRedeem', couponId: fixed.id }), testCtx).result).toMatchObject({ reason: 'forbidden' });
    expect(applyAction(state, fixed.to, act({ type: 'coupon.confirmRedeem', couponId: 'no-such-coupon' }), testCtx).result).toMatchObject({ reason: 'invalid' });
  });
});
