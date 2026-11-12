// Tests gegen den lokal gestarteten Worker: Bauzug, Meilenstein und Gutscheine über die echte Schnittstelle –
// vor allem, was der Server wem schickt. Aufgaben werden so erledigt, wie zwei Spieler es täten, mit gestellter Uhr.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import generated from '../../generated/content-rules.json';
import type { RulesContent } from '../../shared/content-schema.ts';
import { otherSlot } from '../../shared/model.ts';
import { freeSpotsFor } from '../../shared/rules.ts';
import { nextDay } from '../../shared/time.ts';
import { action, noon, ORIGIN, pair, playTask, playTasks, sync } from './client.ts';
import { type LocalApi, startLocalApi } from './local-api.ts';

const chapter = (generated as unknown as RulesContent).chapters[0]!;
const fixedAt = new Set(chapter.coupons.map((c) => c.milestone));
/** Der erste Meilenstein ohne festen Gutschein: Dort wartet ein hinterlegter geheimer Gutschein. */
const freeMilestone = chapter.milestones.find((m) => !fixedAt.has(m))!;
/** Erster Spieltag der gestellten Uhr. */
const START = '2027-01-11';

let api: LocalApi;

beforeAll(async () => {
  api = await startLocalApi({ origin: ORIGIN });
});
afterAll(async () => {
  await api.close();
});

describe('Geheime Gutscheine', () => {
  it('der Text steht erst mit dem Meilenstein in einer Antwort an den Beschenkten', async () => {
    const players = await pair(api, undefined, noon(START));
    const { a, b } = players;
    const secret = 'Nur-fuer-Ada-0815';
    const deposited = await sync(api, b.token, [action({ type: 'coupon.deposit', text: secret })], noon(START));
    expect(deposited.text).toContain(secret);

    // Bis eine Aufgabe vor dem Meilenstein: In keiner Antwort an A steht der Text – auch nicht in denen auf A's eigene Schritte.
    let day = START;
    for (let done = 0; done < freeMilestone - 1; done++) {
      const reply = await sync(api, a.token, [], noon(day));
      expect(reply.json.view.done).toHaveLength(done);
      expect(reply.text, `nach ${done} Aufgaben`).not.toContain(secret);
      expect(reply.json.view.coupons.find((c) => c.kind === 'secret')).toMatchObject({ state: 'veiled', text: null, milestone: freeMilestone });
      for (const played of await playTask(api, players, noon(day))) {
        if (played.slot === 'a') expect(played.reply.text, `nach ${done} Aufgaben, eigener Schritt`).not.toContain(secret);
      }
      day = nextDay(day);
    }
    const before = await sync(api, a.token, [], noon(day));
    expect(before.json.view.done).toHaveLength(freeMilestone - 1);
    expect(before.text).not.toContain(secret);

    // Die Aufgabe, die den Meilenstein auslöst: Erst die Antwort danach zeigt den Text.
    const reaching = await playTask(api, players, noon(day), 'a');
    const afterwards = await sync(api, a.token, [], noon(day));
    for (const reply of [reaching.at(-1)!.reply, afterwards]) {
      expect(reply.json.view.milestones).toMatchObject([{ at: freeMilestone, decoPiece: null, seenBy: [] }]);
    }
    expect(afterwards.json.view.coupons.find((c) => c.kind === 'secret')).toMatchObject({ state: 'unlocked', text: secret });
  });
});

describe('Bauzug', () => {
  it('wählen und platzieren laufen über den Server; die falsche Rolle wird abgelehnt und beide sehen denselben Stand', async () => {
    const players = await pair(api, undefined, noon(START));
    const { a, b } = players;
    await playTasks(api, players, 1, START);
    const view = (await sync(api, a.token, [], noon(START))).json.view;
    const turn = view.buildTurns[0]!;
    const chooser = { a, b }[turn.chooser];
    const placer = { a, b }[otherSlot(turn.chooser)];
    const pieceId = turn.offer[0]!;
    const spot = freeSpotsFor(chapter.pieces.find((p) => p.id === pieceId)!, view.placements, chapter)[0]!;

    // Wer platziert, kann nicht wählen.
    const wrong = await sync(api, placer.token, [action({ type: 'build.choose', turn: turn.n, pieceId })]);
    expect(wrong.json.results).toMatchObject([{ outcome: 'rejected', reason: 'forbidden' }]);
    expect(wrong.json.view.buildTurns[0]).toMatchObject({ chosen: null });

    // Wählen und – in derselben Anfrage vom selben Gerät – platzieren: Das zweite steht dem Wählenden nicht zu.
    const chosen = await sync(api, chooser.token, [action({ type: 'build.choose', turn: turn.n, pieceId }), action({ type: 'build.place', turn: turn.n, spotId: spot.id })]);
    expect(chosen.json.results).toMatchObject([{ outcome: 'applied' }, { outcome: 'rejected', reason: 'forbidden' }]);
    expect(chosen.json.view.placements).toEqual([]);

    const placed = await sync(api, placer.token, [action({ type: 'build.place', turn: turn.n, spotId: spot.id })]);
    expect(placed.json.results).toMatchObject([{ outcome: 'applied' }]);
    const other = await sync(api, chooser.token);
    for (const reply of [placed, other]) {
      expect(reply.json.view.placements).toEqual([{ pieceId, spotId: spot.id }]);
      expect(reply.json.view.buildTurns[0]).toMatchObject({ chosen: pieceId, placedAt: spot.id });
    }
  });

  it('dieselbe Platzierung zweimal gesendet stellt das Stück nur einmal auf', async () => {
    const players = await pair(api, undefined, noon(START));
    const { a, b } = players;
    await playTasks(api, players, 1, START);
    const view = (await sync(api, a.token, [], noon(START))).json.view;
    const turn = view.buildTurns[0]!;
    const pieceId = turn.offer[0]!;
    const spot = freeSpotsFor(chapter.pieces.find((p) => p.id === pieceId)!, view.placements, chapter)[0]!;
    await sync(api, { a, b }[turn.chooser].token, [action({ type: 'build.choose', turn: turn.n, pieceId })]);

    const place = action({ type: 'build.place', turn: turn.n, spotId: spot.id });
    const placer = { a, b }[otherSlot(turn.chooser)];
    expect((await sync(api, placer.token, [place])).json.results).toMatchObject([{ outcome: 'applied' }]);
    const again = await sync(api, placer.token, [place]);
    expect(again.json.results).toMatchObject([{ outcome: 'duplicate' }]);
    expect(again.json.view.placements).toEqual([{ pieceId, spotId: spot.id }]);
  });
});

describe('Aktion aus der Bauphase', () => {
  it('die Test-Aufgabe einer älteren App wird abgelehnt, ohne den Abgleich zu stören', async () => {
    const { a } = await pair(api);
    const reply = await sync(api, a.token, [action({ type: 'test.completeTask' }), action({ type: 'coupon.deposit', text: 'Still works' })]);
    expect(reply.status).toBe(200);
    expect(reply.json.results).toMatchObject([{ outcome: 'rejected', reason: 'forbidden' }, { outcome: 'applied' }]);
    expect(reply.json.view.done).toEqual([]);
    expect(reply.json.view).not.toHaveProperty('testActions');
  });
});
