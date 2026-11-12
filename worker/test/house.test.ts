// Tests gegen den lokal gestarteten Worker: Bauzug, Meilenstein und Gutscheine über die echte Schnittstelle –
// vor allem, was der Server wem schickt.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import generated from '../../generated/content-rules.json';
import type { RulesContent } from '../../shared/content-schema.ts';
import { otherSlot } from '../../shared/model.ts';
import { freeSpotsFor } from '../../shared/rules.ts';
import { action, ORIGIN, pair, sync } from './client.ts';
import { type LocalApi, startLocalApi } from './local-api.ts';

const chapter = (generated as unknown as RulesContent).chapters[0]!;
const fixedAt = new Set(chapter.coupons.map((c) => c.milestone));
/** Der erste Meilenstein ohne festen Gutschein: Dort wartet ein hinterlegter geheimer Gutschein. */
const freeMilestone = chapter.milestones.find((m) => !fixedAt.has(m))!;

let api: LocalApi;

beforeAll(async () => {
  api = await startLocalApi({ origin: ORIGIN });
});
afterAll(async () => {
  await api.close();
});

/** Erledigt `count` Aufgaben über die Test-Aktion (im lokalen Worker eingeschaltet). */
async function complete(token: string, count: number): Promise<void> {
  for (let i = 0; i < count; i++) {
    const reply = await sync(api, token, [action({ type: 'test.completeTask' })]);
    expect(reply.json.results).toMatchObject([{ outcome: 'applied' }]);
  }
}

describe('Geheime Gutscheine', () => {
  it('der Text steht erst mit dem Meilenstein in einer Antwort an den Beschenkten', async () => {
    const { a, b } = await pair(api);
    const secret = 'Nur-fuer-Ada-0815';
    const deposited = await sync(api, b.token, [action({ type: 'coupon.deposit', text: secret })]);
    expect(deposited.text).toContain(secret);

    // Bis eine Aufgabe vor dem Meilenstein: In keiner Antwort an A steht der Text.
    for (let done = 0; done < freeMilestone; done++) {
      const reply = await sync(api, a.token);
      expect(reply.json.view.done).toHaveLength(done);
      expect(reply.text, `nach ${done} Aufgaben`).not.toContain(secret);
      expect(reply.json.view.coupons.find((c) => c.kind === 'secret')).toMatchObject({ state: 'veiled', text: null, milestone: freeMilestone });
      if (done < freeMilestone - 1) await complete(b.token, 1);
    }

    // Auch die Antwort auf die eigene Aktion, die den Meilenstein auslöst, zeigt erst den neuen Stand.
    const reaching = await sync(api, a.token, [action({ type: 'test.completeTask' })]);
    expect(reaching.json.view.milestones).toMatchObject([{ at: freeMilestone, decoPiece: null, seenBy: [] }]);
    expect(reaching.json.view.coupons.find((c) => c.kind === 'secret')).toMatchObject({ state: 'unlocked', text: secret });
  });
});

describe('Bauzug', () => {
  it('wählen und platzieren laufen über den Server; die falsche Rolle wird abgelehnt und beide sehen denselben Stand', async () => {
    const { a, b } = await pair(api);
    await complete(a.token, 1);
    const view = (await sync(api, a.token)).json.view;
    const turn = view.buildTurns[0]!;
    const players = { a, b };
    const chooser = players[turn.chooser];
    const placer = players[otherSlot(turn.chooser)];
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
    const { a, b } = await pair(api);
    await complete(a.token, 1);
    const view = (await sync(api, a.token)).json.view;
    const turn = view.buildTurns[0]!;
    const players = { a, b };
    const pieceId = turn.offer[0]!;
    const spot = freeSpotsFor(chapter.pieces.find((p) => p.id === pieceId)!, view.placements, chapter)[0]!;
    await sync(api, players[turn.chooser].token, [action({ type: 'build.choose', turn: turn.n, pieceId })]);

    const place = action({ type: 'build.place', turn: turn.n, spotId: spot.id });
    const placer = players[otherSlot(turn.chooser)];
    expect((await sync(api, placer.token, [place])).json.results).toMatchObject([{ outcome: 'applied' }]);
    const again = await sync(api, placer.token, [place]);
    expect(again.json.results).toMatchObject([{ outcome: 'duplicate' }]);
    expect(again.json.view.placements).toEqual([{ pieceId, spotId: spot.id }]);
  });
});

describe('Test-Aufgaben', () => {
  it('der lokale Worker nimmt sie an und sagt das in der Sicht', async () => {
    const { a } = await pair(api);
    expect((await sync(api, a.token)).json.view.testActions).toBe(true);
  });

  it('ohne die Variable TEST_ACTIONS lehnt der Server sie ab – so ist es im Betrieb, sobald sie entfällt', async () => {
    const strict = await startLocalApi({ origin: ORIGIN, vars: { TEST_ACTIONS: '' } });
    try {
      const { a } = await pair(strict);
      const reply = await sync(strict, a.token, [action({ type: 'test.completeTask' })]);
      expect(reply.json.results).toMatchObject([{ outcome: 'rejected', reason: 'forbidden' }]);
      expect(reply.json.view.done).toEqual([]);
      expect(reply.json.view.testActions).toBe(false);
    } finally {
      await strict.close();
    }
  });
});
