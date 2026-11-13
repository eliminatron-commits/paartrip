import { describe, expect, it, vi } from 'vitest';
import generated from '../generated/content-rules.json';
import type { Action, ActionBody } from './actions.ts';
import type { RulesContent } from './content-schema.ts';
import { type DoneTask, type HouseState, otherSlot, type Slot } from './model.ts';
import {
  applyAction,
  completeTask,
  createHouse,
  freeSpotsFor,
  joinHouse,
  milestoneForDeposit,
  moveSpotsFor,
  placeSpotsFor,
  type RuleContext,
  spotsOf,
  unplacedDeco,
} from './rules.ts';

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
// Hier geht es um das, was auf eine erledigte Aufgabe folgt. Wie eine Aufgabe erledigt wird, prüft tasks.test.ts.

function act(body: ActionBody): Action {
  n += 1;
  return { ...body, id: `action-${String(n).padStart(4, '0')}`, at: ctx.now } as Action;
}

/** Wendet eine Aktion an und verlangt, dass sie gilt. */
function play(state: HouseState, slot: Slot, body: ActionBody): HouseState {
  const applied = applyAction(state, slot, act(body), ctx);
  expect(applied.result, JSON.stringify(body)).toMatchObject({ outcome: 'applied' });
  return applied.state;
}

/** Eine erledigte Aufgabe, wie die Regeln der Aufgabentypen sie an `completeTask` übergeben. */
const finished = (state: HouseState): DoneTask => ({
  taskId: `task-${state.done.length + 1}`,
  completedAt: ctx.now,
  progress: { type: 'puzzle', solvedBy: 'a' },
});

/** Erledigt `count` Aufgaben über `completeTask` – denselben Weg, den jede echte Aufgabe am Ende nimmt. */
function complete(state: HouseState, count = 1): HouseState {
  for (let i = 0; i < count; i++) state = completeTask(state, finished(state), ctx).state;
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
    for (const turn of state.buildTurns) expect(turn).toMatchObject({ chosen: null, placedAt: null });
    const offer = state.buildTurns[0]!.offer;
    expect(offer).toHaveLength(chapter.build.offerSize);
    expect(new Set(offer).size).toBe(offer.length);
    // Nur normale Stücke: Die Dekostücke der Meilensteine kommen nie ins Angebot.
    expect(offer.every((id) => piece(id) !== undefined && piece(id).milestone === undefined)).toBe(true);
  });

  it('Bauzüge laufen einer nach dem anderen: Der wartende bekommt sein Angebot erst, wenn er dran ist', () => {
    let state = complete(paired(), 2);
    // Zug 2 wartet noch – ohne Angebot, und spielen lässt er sich nicht.
    expect(turnOf(state, 2).offer).toEqual([]);
    const waiting = turnOf(state, 2).chooser;
    const anyPiece = turnOf(state, 1).offer[0]!;
    expect(applyAction(state, waiting, act({ type: 'build.choose', turn: 2, pieceId: anyPiece }), ctx).result).toMatchObject({ reason: 'stale' });

    state = finishTurn(state, 1);
    const placed = state.placements[0]!.pieceId;
    const offer = turnOf(state, 2).offer;
    expect(offer).toHaveLength(chapter.build.offerSize);
    // Aus dem, was jetzt noch zu haben ist.
    expect(offer).not.toContain(placed);
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

  it('die Test-Aktion aus der Bauphase lehnt der Server immer ab – eine ältere App hängt daran nicht fest', () => {
    const state = paired();
    const applied = applyAction(state, 'a', act({ type: 'test.completeTask' }), ctx);
    expect(applied.result).toMatchObject({ outcome: 'rejected', reason: 'forbidden' });
    expect(applied.state).toBe(state);
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

    const choosing = applyAction(state, chooser, act({ type: 'build.choose', turn: 1, pieceId: chosen }), ctx);
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
    expect(applyAction(state, placer, act({ type: 'build.choose', turn: 1, pieceId: offer[0]! }), ctx).result).toMatchObject({ reason: 'forbidden' });
    state = play(state, chooser, { type: 'build.choose', turn: 1, pieceId: offer[0]! });
    const spot = freeSpotsFor(piece(offer[0]!), state.placements, chapter)[0]!;
    expect(applyAction(state, chooser, act({ type: 'build.place', turn: 1, spotId: spot.id }), ctx).result).toMatchObject({ reason: 'forbidden' });
  });

  it('gewählt wird nur aus dem Angebot und nur einmal; platziert wird erst nach dem Wählen', () => {
    let state = complete(paired());
    const { chooser, offer } = turnOf(state, 1);
    const placer = otherSlot(chooser);
    const outside = chapter.pieces.find((p) => !offer.includes(p.id))!;
    const anySpot = spotsOf(chapter)[0]!;

    expect(applyAction(state, chooser, act({ type: 'build.choose', turn: 1, pieceId: outside.id }), ctx).result).toMatchObject({ reason: 'invalid' });
    expect(applyAction(state, chooser, act({ type: 'build.choose', turn: 99, pieceId: offer[0]! }), ctx).result).toMatchObject({ reason: 'invalid' });
    expect(applyAction(state, placer, act({ type: 'build.place', turn: 1, spotId: anySpot.id }), ctx).result).toMatchObject({ reason: 'stale' });

    state = play(state, chooser, { type: 'build.choose', turn: 1, pieceId: offer[0]! });
    expect(applyAction(state, chooser, act({ type: 'build.choose', turn: 1, pieceId: offer[1]! }), ctx).result).toMatchObject({ reason: 'stale' });
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
    const place = (spotId: string) => applyAction(state, placer, act({ type: 'build.place', turn: 2, spotId }), ctx);

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
    const applied = applyAction(open, otherSlot(first.chooser), act({ type: 'build.place', turn: 2, spotId }), ctx);
    expect(applied.result).toMatchObject({ outcome: 'rejected', reason: 'stale' });
    expect(applied.state.placements).toEqual([{ pieceId, spotId }]);
  });

  it('ein abgeschlossener Zug nimmt nichts mehr an', () => {
    const state = finishTurn(complete(paired()), 1);
    const free = spotsOf(chapter).find((s) => s.id !== state.placements[0]!.spotId)!;
    const placer = otherSlot(turnOf(state, 1).chooser);
    expect(applyAction(state, placer, act({ type: 'build.place', turn: 1, spotId: free.id }), ctx).result).toMatchObject({ reason: 'stale' });
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
    expect(applyAction(state, 'a', act({ type: 'piece.move', pieceId, spotId: from }), ctx).result).toMatchObject({ reason: 'stale' });
  });

  describe('damit kein Bauzug hängen bleibt', () => {
    // Ein kleines Haus mit bekannten Größen: zwei Bodenplätze, ein Wandplatz; zwei Stücke nur für den Boden,
    // eines für Boden oder Wand.
    const tiny: RulesContent = {
      chapters: [
        {
          number: 1,
          title: 'Tiny',
          titleVi: 'Tiny',
          taskOrder: ['task'],
          milestones: [9],
          build: { offerSize: 2, firstChooser: 'a' },
          tasks: [{ id: 'task', type: 'reallife', title: 'Task', text: 'Do it.', doer: 'both' }],
          coupons: [],
          rooms: [
            {
              id: 'room',
              name: 'Room',
              spots: [
                { id: 'room-floor-1', kind: 'floor', x: 0, y: 0, size: 1 },
                { id: 'room-floor-2', kind: 'floor', x: 0, y: 0, size: 1 },
                { id: 'room-wall-1', kind: 'wall', x: 0, y: 0, size: 1 },
              ],
            },
          ],
          pieces: [
            { id: 'chair', name: 'Chair', fits: ['floor'] },
            { id: 'lamp', name: 'Lamp', fits: ['floor'] },
            { id: 'banner', name: 'Banner', fits: ['floor', 'wall'] },
          ],
        },
      ],
    };
    const tinyCtx: RuleContext = { content: tiny, now: ctx.now };
    const tinyChapter = tiny.chapters[0]!;
    const house = (): HouseState => joinHouse(createHouse('tiny-house', 'Ada', tinyCtx), 'Bao', tinyCtx)!;
    const banner = tinyChapter.pieces.find((p) => p.id === 'banner')!;
    const move = (state: HouseState, spotId: string) => applyAction(state, 'a', act({ type: 'piece.move', pieceId: 'banner', spotId }), tinyCtx);

    it('Umstellen, das dem gewählten Stück den letzten Platz nähme, wird abgelehnt', () => {
      // Der Stuhl ist gewählt und braucht einen Bodenplatz; frei ist nur noch room-floor-2.
      const state: HouseState = {
        ...house(),
        placements: [
          { pieceId: 'banner', spotId: 'room-wall-1' },
          { pieceId: 'lamp', spotId: 'room-floor-1' },
        ],
        buildTurns: [{ n: 1, chooser: 'a', offer: ['chair'], chosen: 'chair', placedAt: null }],
      };
      expect(moveSpotsFor(banner, state, tinyChapter)).toEqual([]);
      const applied = move(state, 'room-floor-2');
      expect(applied.result).toMatchObject({ outcome: 'rejected', reason: 'stale' });
      expect(applied.state).toBe(state);
      // Der Zug lässt sich danach abschließen.
      expect(applyAction(state, 'b', act({ type: 'build.place', turn: 1, spotId: 'room-floor-2' }), tinyCtx).result).toMatchObject({ outcome: 'applied' });
    });

    it('auch vor der Wahl bleibt für mindestens ein angebotenes Stück ein Platz', () => {
      const state: HouseState = {
        ...house(),
        placements: [
          { pieceId: 'banner', spotId: 'room-wall-1' },
          { pieceId: 'filler', spotId: 'room-floor-1' },
        ],
        buildTurns: [{ n: 1, chooser: 'a', offer: ['chair', 'lamp'], chosen: null, placedAt: null }],
      };
      expect(move(state, 'room-floor-2').result).toMatchObject({ outcome: 'rejected', reason: 'stale' });
    });

    it('bleibt dem Bauzug ein anderer Platz, ist das Umstellen erlaubt', () => {
      const state: HouseState = {
        ...house(),
        placements: [{ pieceId: 'banner', spotId: 'room-wall-1' }],
        buildTurns: [{ n: 1, chooser: 'a', offer: ['chair'], chosen: 'chair', placedAt: null }],
      };
      expect(moveSpotsFor(banner, state, tinyChapter).map((s) => s.id)).toEqual(['room-floor-1', 'room-floor-2']);
      expect(move(state, 'room-floor-2').state.placements).toEqual([{ pieceId: 'banner', spotId: 'room-floor-2' }]);
    });

    it('passt für einen wartenden Zug nichts mehr ins Haus, wenn er dran wäre, entfällt er', () => {
      // Nur ein Platz ist frei; zwei Aufgaben bringen zwei Züge.
      let state: HouseState = {
        ...house(),
        placements: [
          { pieceId: 'filler-1', spotId: 'room-floor-1' },
          { pieceId: 'filler-2', spotId: 'room-wall-1' },
        ],
      };
      for (let i = 0; i < 2; i++) state = completeTask(state, finished(state), tinyCtx).state;
      expect(state.buildTurns.map((t) => t.n)).toEqual([1, 2]);
      const first = state.buildTurns[0]!;
      expect(first.offer).toHaveLength(2);

      state = applyAction(state, first.chooser, act({ type: 'build.choose', turn: 1, pieceId: first.offer[0]! }), tinyCtx).state;
      state = applyAction(state, otherSlot(first.chooser), act({ type: 'build.place', turn: 1, spotId: 'room-floor-2' }), tinyCtx).state;
      // Das Haus ist voll: Zug 2 hängt nicht für immer offen, er entfällt. Die Aufgaben zählen trotzdem.
      expect(state.buildTurns).toEqual([{ ...first, chosen: first.offer[0], placedAt: 'room-floor-2' }]);
      expect(state.done).toHaveLength(2);
    });
  });

  it('was nicht im Haus steht, lässt sich nicht umstellen', () => {
    const state = complete(paired());
    const offered = turnOf(state, 1).offer[0]!;
    const spot = freeSpotsFor(piece(offered), state.placements, chapter)[0]!;
    expect(applyAction(state, 'a', act({ type: 'piece.move', pieceId: offered, spotId: spot.id }), ctx).result).toMatchObject({ reason: 'invalid' });
    expect(applyAction(state, 'a', act({ type: 'piece.move', pieceId: 'no-such-piece', spotId: spot.id }), ctx).result).toMatchObject({ reason: 'invalid' });
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

    const reached = completeTask(state, finished(state), ctx);
    expect(reached.state.milestones).toEqual([{ at: free, reachedAt: ctx.now, decoPiece: null, seenBy: [] }]);
    expect(reached.state.coupons.find((c) => c.id === secret.id)).toMatchObject({ state: 'unlocked' });
    // Nur was an diesem Meilenstein liegt, geht auf.
    expect(reached.state.coupons.filter((c) => c.milestone !== free).every((c) => c.state === 'veiled')).toBe(true);
    // Die Beschenkte bekommt die Mitteilung. Dass sie ausbleibt, wenn sie den Meilenstein selbst auslöst,
    // prüft tasks.test.ts mit echten Aufgaben.
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
    const before = complete(paired(), free - 1);
    const reached = completeTask(before, finished(before), ctx);
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
    expect(applyAction(state, 'a', act({ type: 'piece.move', pieceId: deco!.id, spotId: spot.id }), ctx).result).toMatchObject({ reason: 'invalid' });
  });

  describe('jedem Dekostück bleibt ein Platz frei', () => {
    // Ein kleines Haus mit bekannten Größen: zwei Bodenplätze, ein Wandplatz. Am Meilenstein 2 wartet eine Vase,
    // die nur auf den Boden passt.
    const small: RulesContent = {
      chapters: [
        {
          number: 1,
          title: 'Small',
          titleVi: 'Small',
          taskOrder: ['task'],
          milestones: [2],
          build: { offerSize: 3, firstChooser: 'a' },
          tasks: [{ id: 'task', type: 'reallife', title: 'Task', text: 'Do it.', doer: 'both' }],
          coupons: [],
          rooms: [
            {
              id: 'room',
              name: 'Room',
              spots: [
                { id: 'room-floor-1', kind: 'floor', x: 0, y: 0, size: 1 },
                { id: 'room-floor-2', kind: 'floor', x: 0, y: 0, size: 1 },
                { id: 'room-wall-1', kind: 'wall', x: 0, y: 0, size: 1 },
              ],
            },
          ],
          pieces: [
            { id: 'chair', name: 'Chair', fits: ['floor'] },
            { id: 'lamp', name: 'Lamp', fits: ['floor'] },
            { id: 'banner', name: 'Banner', fits: ['floor', 'wall'] },
            { id: 'vase', name: 'Vase', fits: ['floor'], milestone: 2 },
          ],
        },
      ],
    };
    const smallCtx: RuleContext = { content: small, now: ctx.now };
    const smallChapter = small.chapters[0]!;
    const house = (): HouseState => joinHouse(createHouse('small-house', 'Ada', smallCtx), 'Bao', smallCtx)!;
    const banner = smallChapter.pieces.find((p) => p.id === 'banner')!;
    const done = (state: HouseState) => completeTask(state, finished(state), smallCtx).state;
    const apply = (state: HouseState, slot: Slot, body: ActionBody) => applyAction(state, slot, act(body), smallCtx);

    it('der Bauzug bietet nichts an, was der Vase den letzten Platz nähme, und stellt nichts dorthin', () => {
      // Ein Bodenplatz ist besetzt, der andere bleibt der Vase: Die Lampe (nur Boden) kommt nicht ins Angebot.
      let state = done({ ...house(), placements: [{ pieceId: 'chair', spotId: 'room-floor-1' }] });
      expect(state.buildTurns).toMatchObject([{ n: 1, offer: ['banner'] }]);

      state = apply(state, 'a', { type: 'build.choose', turn: 1, pieceId: 'banner' }).state;
      // Das Banner passt auf Boden und Wand – erlaubt ist nur die Wand.
      expect(placeSpotsFor(banner, state, smallChapter).map((s) => s.id)).toEqual(['room-wall-1']);
      const onFloor = apply(state, 'b', { type: 'build.place', turn: 1, spotId: 'room-floor-2' });
      expect(onFloor.result).toMatchObject({ outcome: 'rejected', reason: 'stale' });
      expect(onFloor.state).toBe(state);
      expect(apply(state, 'b', { type: 'build.place', turn: 1, spotId: 'room-wall-1' }).result).toMatchObject({ outcome: 'applied' });
    });

    it('Umstellen lässt der Vase ihren Platz – auch solange ihr Meilenstein noch nicht erreicht ist', () => {
      const state: HouseState = {
        ...house(),
        placements: [
          { pieceId: 'chair', spotId: 'room-floor-1' },
          { pieceId: 'banner', spotId: 'room-wall-1' },
        ],
      };
      expect(moveSpotsFor(banner, state, smallChapter)).toEqual([]);
      const moved = apply(state, 'a', { type: 'piece.move', pieceId: 'banner', spotId: 'room-floor-2' });
      expect(moved.result).toMatchObject({ outcome: 'rejected', reason: 'stale' });
      expect(moved.state).toBe(state);
    });

    it('Umstellen lässt Platz für beide: den offenen Bauzug und die Vase', () => {
      // Der Stuhl ist gewählt und braucht einen Bodenplatz, die Vase den anderen.
      const state: HouseState = {
        ...house(),
        placements: [{ pieceId: 'banner', spotId: 'room-wall-1' }],
        buildTurns: [{ n: 1, chooser: 'a', offer: ['chair'], chosen: 'chair', placedAt: null }],
      };
      expect(moveSpotsFor(banner, state, smallChapter)).toEqual([]);
      expect(apply(state, 'a', { type: 'piece.move', pieceId: 'banner', spotId: 'room-floor-1' }).result).toMatchObject({ outcome: 'rejected', reason: 'stale' });
    });

    it('die Vase selbst kommt auf ihren Platz, sobald ihr Meilenstein erreicht ist', () => {
      let state = done(done({ ...house(), placements: [{ pieceId: 'chair', spotId: 'room-floor-1' }] }));
      expect(unplacedDeco(state)).toEqual(['vase']);
      const vase = smallChapter.pieces.find((p) => p.id === 'vase')!;
      expect(moveSpotsFor(vase, state, smallChapter).map((s) => s.id)).toEqual(['room-floor-2']);
      state = apply(state, 'b', { type: 'piece.move', pieceId: 'vase', spotId: 'room-floor-2' }).state;
      expect(state.placements).toContainEqual({ pieceId: 'vase', spotId: 'room-floor-2' });
    });

    it('liegt am Meilenstein ein Gutschein statt der Vase, ist der freigehaltene Platz mit dem Meilenstein wieder zu haben', () => {
      let state: HouseState = {
        ...house(),
        placements: [
          { pieceId: 'chair', spotId: 'room-floor-1' },
          { pieceId: 'banner', spotId: 'room-wall-1' },
        ],
      };
      state = apply(state, 'a', { type: 'coupon.deposit', text: 'Tea for two' }).state;
      // Vor dem Meilenstein gilt die Vase als ausstehend: Für die Lampe ist nichts frei, der Bauzug entfällt.
      state = done(state);
      expect(state.buildTurns).toEqual([]);
      // Am Meilenstein liegt der Gutschein, die Vase kommt nicht – der Bauzug dieser Aufgabe bekommt den Platz.
      state = done(state);
      expect(state.milestones).toMatchObject([{ at: 2, decoPiece: null }]);
      expect(state.buildTurns).toMatchObject([{ n: 2, offer: ['lamp'] }]);
    });

    describe('im ganzen Kapitel', () => {
      const decos = chapter.pieces.filter((p) => p.milestone !== undefined);
      const turns = chapter.taskOrder.length;
      /** Wer wählt, nimmt möglichst ein Stück, das auf einen Platz von `rival` passt – so wird es dort am schnellsten eng. */
      const crowding = (rival: { fits: string[] }) => (offer: string[]) => offer.find((id) => piece(id).fits.some((kind) => rival.fits.includes(kind))) ?? offer[0]!;
      const strategies: [string, (offer: string[], turn: number) => string][] = [
        ['wer wählt, nimmt das erste Angebot', (offer) => offer[0]!],
        ['wer wählt, nimmt reihum ein anderes', (offer, turn) => offer[turn % offer.length]!],
        ...decos.map((deco): [string, (offer: string[]) => string] => [`wer wählt, macht es für ${deco.id} eng`, crowding(deco)]),
      ];

      /**
       * Spielt das ganze Kapitel nur mit den Regeln: jede Aufgabe, jeden Bauzug. Dekostücke kommen sofort ins Haus
       * oder bleiben bis zum Schluss liegen; mit `gifted` liegt an jedem freien Meilenstein ein geheimer Gutschein.
       */
      function playChapter(id: string, pick: (offer: string[], turn: number) => string, decoAtOnce: boolean, gifted: boolean): HouseState {
        let state: HouseState = { ...paired(), id };
        if (gifted) for (const deco of decos) state = play(state, 'a', { type: 'coupon.deposit', text: `instead of ${deco.id}` });
        const placeDeco = () => {
          for (const decoId of unplacedDeco(state)) {
            const spot = moveSpotsFor(piece(decoId), state, chapter)[0];
            expect(spot, `Platz für ${decoId} in ${id}`).toBeDefined();
            state = play(state, 'b', { type: 'piece.move', pieceId: decoId, spotId: spot!.id });
          }
        };
        for (let turn = 1; turn <= turns; turn++) {
          state = complete(state);
          const open = state.buildTurns.find((t) => t.n === turn);
          expect(open?.offer.length, `Angebot im Bauzug ${turn} in ${id}`).toBeGreaterThan(0);
          const chosen = pick(open!.offer, turn);
          state = play(state, open!.chooser, { type: 'build.choose', turn, pieceId: chosen });
          const spot = placeSpotsFor(piece(chosen), state, chapter)[0]!;
          state = play(state, otherSlot(open!.chooser), { type: 'build.place', turn, spotId: spot.id });
          if (decoAtOnce) placeDeco();
        }
        placeDeco();
        return state;
      }

      it.each(strategies)('%s: jeder Bauzug bringt ein Stück, und jedes Dekostück findet seinen Platz – sofort oder erst am Schluss', (_, pick) => {
        for (let house = 0; house < 40; house++) {
          for (const decoAtOnce of [true, false]) {
            const end = playChapter(`house-${house}`, pick, decoAtOnce, false);
            expect(end.buildTurns.filter((t) => t.placedAt !== null)).toHaveLength(turns);
            expect(unplacedDeco(end)).toEqual([]);
            expect(end.placements).toHaveLength(turns + decos.length);
          }
        }
      });

      it.each(strategies)('%s: auch ohne Dekostücke (überall ein geheimer Gutschein) bringt jeder Bauzug ein Stück', (_, pick) => {
        for (let house = 0; house < 40; house++) {
          const end = playChapter(`house-${house}`, pick, true, true);
          expect(end.milestones.every((m) => m.decoPiece === null)).toBe(true);
          expect(end.placements).toHaveLength(turns);
        }
      });
    });
  });

  it('jeder merkt für sich, dass er Szene und Geschenk gesehen hat', () => {
    let state = complete(paired(), free);
    state = play(state, 'b', { type: 'milestone.seen', milestone: free });
    expect(state.milestones[0]!.seenBy).toEqual(['b']);
    // Ein zweites Mal ändert nichts.
    expect(play(state, 'b', { type: 'milestone.seen', milestone: free }).milestones[0]!.seenBy).toEqual(['b']);
    state = play(state, 'a', { type: 'milestone.seen', milestone: free });
    expect(state.milestones[0]!.seenBy).toEqual(['b', 'a']);
    expect(applyAction(state, 'a', act({ type: 'milestone.seen', milestone: free + 1 }), ctx).result).toMatchObject({ reason: 'invalid' });
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
    expect(applyAction(state, fixed.to, act(request), ctx).result).toMatchObject({ reason: 'stale' });

    state = unlocked();
    expect(coupon()).toMatchObject({ state: 'unlocked', redeemRequestedAt: null, redeemedAt: null });
    // Bestätigen kann der Schenkende erst nach der Anfrage.
    expect(applyAction(state, fixed.from, act(confirm), ctx).result).toMatchObject({ reason: 'stale' });

    const requested = applyAction(state, fixed.to, act(request), ctx);
    expect(requested.effects).toEqual([{ to: fixed.from, kind: 'redeem_requested' }]);
    state = requested.state;
    expect(coupon()).toMatchObject({ state: 'unlocked', redeemRequestedAt: ctx.now, redeemedAt: null });
    expect(applyAction(state, fixed.to, act(request), ctx).result).toMatchObject({ reason: 'stale' });

    state = play(state, fixed.from, confirm);
    expect(coupon()).toMatchObject({ state: 'redeemed', redeemedAt: ctx.now });
    expect(applyAction(state, fixed.from, act(confirm), ctx).result).toMatchObject({ reason: 'stale' });
  });

  it('anfragen darf nur der Beschenkte, bestätigen nur der Schenkende', () => {
    let state = unlocked();
    expect(applyAction(state, fixed.from, act({ type: 'coupon.requestRedeem', couponId: fixed.id }), ctx).result).toMatchObject({ reason: 'forbidden' });
    state = play(state, fixed.to, { type: 'coupon.requestRedeem', couponId: fixed.id });
    expect(applyAction(state, fixed.to, act({ type: 'coupon.confirmRedeem', couponId: fixed.id }), ctx).result).toMatchObject({ reason: 'forbidden' });
    expect(applyAction(state, fixed.to, act({ type: 'coupon.confirmRedeem', couponId: 'no-such-coupon' }), ctx).result).toMatchObject({ reason: 'invalid' });
  });
});
