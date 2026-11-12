// Der ganze Weg durch das Kapitel über die echte Schnittstelle: Zwei Spieler erledigen jede Aufgabe der Inhalte
// (eine pro Tag, gestellte Uhr), spielen jeden Bauzug und stellen jedes Dekostück auf – bis zum letzten Meilenstein.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import generated from '../../generated/content-rules.json';
import type { SyncResponse } from '../../shared/api.ts';
import type { RulesContent } from '../../shared/content-schema.ts';
import { type HouseView, otherSlot } from '../../shared/model.ts';
import { activeTurn, freeSpotsFor, unplacedDeco } from '../../shared/rules.ts';
import { nextDay } from '../../shared/time.ts';
import { action, noon, ORIGIN, pair, playTask, type Reply, sync } from './client.ts';
import { type LocalApi, startLocalApi } from './local-api.ts';

const chapter = (generated as unknown as RulesContent).chapters[0]!;
const pieceOf = (id: string) => chapter.pieces.find((piece) => piece.id === id)!;
/** Erster Spieltag der gestellten Uhr. */
const START = '2027-01-11';

let api: LocalApi;

beforeAll(async () => {
  api = await startLocalApi({ origin: ORIGIN });
});
afterAll(async () => {
  await api.close();
});

/** Die Sicht nach einem Schritt, der gelten muss. */
async function applied(reply: Promise<Reply<SyncResponse>>, what: string): Promise<HouseView> {
  const { json } = await reply;
  expect(json.results, what).toMatchObject([{ outcome: 'applied' }]);
  return json.view;
}

describe('Durchlauf des Kapitels', () => {
  it('zwei Spieler kommen mit einer Aufgabe pro Tag bis zum letzten Meilenstein, und jeder Bauzug bringt ein Stück ins Haus', async () => {
    const players = await pair(api, undefined, noon(START));
    let day = START;

    for (const [index, task] of chapter.tasks.entries()) {
      const n = index + 1;
      const now = noon(day);
      const open = (await sync(api, players.a.token, [], now)).json.view;
      expect(open.task, `Aufgabe ${n}`).toMatchObject({ taskId: task.id, availableOn: day, completedAt: null });
      // Mal tut der eine den letzten Schritt, mal der andere.
      await playTask(api, players, now, index % 2 === 0 ? 'a' : 'b');

      // Der Bauzug dieser Aufgabe: einer wählt, der andere platziert.
      let view = (await sync(api, players.a.token, [], now)).json.view;
      expect(view.done, `nach Aufgabe ${n}`).toHaveLength(n);
      const turn = activeTurn(view)!;
      expect(turn, `Bauzug ${n}`).toMatchObject({ n, chosen: null });
      // Gegen Ende darf das Angebot kleiner werden (es zählt, was noch ins Haus passt) – leer ist es nie.
      expect(turn.offer.length, `Angebot im Bauzug ${n}`).toBeGreaterThan(0);
      const pieceId = turn.offer[index % turn.offer.length]!;
      await applied(sync(api, players[turn.chooser].token, [action({ type: 'build.choose', turn: n, pieceId })], now), `wählen im Bauzug ${n}`);
      const spot = freeSpotsFor(pieceOf(pieceId), view.placements, chapter)[0]!;
      view = await applied(sync(api, players[otherSlot(turn.chooser)].token, [action({ type: 'build.place', turn: n, spotId: spot.id })], now), `platzieren im Bauzug ${n}`);

      // Am Meilenstein ohne Gutschein liegt ein Dekostück im Geschenk; einer stellt es auf.
      for (const decoId of unplacedDeco(view)) {
        const free = freeSpotsFor(pieceOf(decoId), view.placements, chapter)[0];
        expect(free, `freier Platz für das Dekostück ${decoId}`).toBeDefined();
        view = await applied(sync(api, players.b.token, [action({ type: 'piece.move', pieceId: decoId, spotId: free!.id })], now), `Dekostück ${decoId} aufstellen`);
      }
      day = nextDay(day);
    }

    const end = (await sync(api, players.b.token, [], noon(day))).json.view;
    expect(end.done.map((d) => d.taskId)).toEqual(chapter.taskOrder);
    // Jeder Meilenstein ist erreicht, der letzte mit der letzten Aufgabe.
    expect(end.milestones.map((m) => m.at)).toEqual(chapter.milestones);
    expect(end.milestones.at(-1)!.at).toBe(chapter.taskOrder.length);
    // Jeder Bauzug hat sein Stück aufgestellt, dazu kommt je Meilenstein ohne festen Gutschein ein Dekostück.
    expect(end.buildTurns.filter((t) => t.placedAt === null)).toEqual([]);
    const decos = end.milestones.flatMap((m) => (m.decoPiece ? [m.decoPiece] : []));
    expect(decos).toEqual(chapter.milestones.filter((m) => !chapter.coupons.some((c) => c.milestone === m)).map((m) => chapter.pieces.find((p) => p.milestone === m)!.id));
    expect(end.placements).toHaveLength(chapter.taskOrder.length + decos.length);
    expect(new Set(end.placements.map((p) => p.spotId)).size).toBe(end.placements.length);
    // Die festen Gutscheine sind freigeschaltet und für die Beschenkte lesbar.
    expect(end.coupons.filter((c) => c.kind === 'fixed')).toMatchObject(chapter.coupons.map((c) => ({ id: c.id, state: 'unlocked', text: c.text })));
    // Danach kommt nichts mehr: Die letzte Aufgabe bleibt erledigt stehen.
    expect(end.task).toMatchObject({ taskId: chapter.taskOrder.at(-1), completedAt: expect.any(String) });
    expect(end.nextTaskOn).toBeNull();
  });
});
