// Tests gegen den lokal gestarteten Worker: der Tagesablauf mit gestellter Uhr, die Morgen-Mitteilung über
// den Cron-Auslöser und dass die Uhr sich im Betrieb nicht stellen lässt.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import generated from '../../generated/content-rules.json';
import type { PushPayload } from '../../shared/api.ts';
import type { RulesContent } from '../../shared/content-schema.ts';
import { dayKey, nextDay } from '../../shared/time.ts';
import { action, call, noon, ORIGIN, pair, playTask, playTasks, sync } from './client.ts';
import { type LocalApi, startLocalApi } from './local-api.ts';
import { decryptPush, type FakePushService, newDeviceKeys, startFakePushService } from './receive.ts';

const chapter = (generated as unknown as RulesContent).chapters[0]!;
/** Erster Spieltag der gestellten Uhr (Winterzeit: Berlin = UTC+1). */
const START = '2027-01-11';
const berlin = (day: string, time: string) => new Date(`${day}T${time}+01:00`).toISOString();

let api: LocalApi;
let service: FakePushService;

beforeAll(async () => {
  [api, service] = await Promise.all([startLocalApi({ origin: ORIGIN }), startFakePushService()]);
});
afterAll(async () => {
  await Promise.all([api.close(), service.close()]);
});

describe('Tagesablauf mit gestellter Uhr', () => {
  it('die erste Aufgabe erscheint mit dem Einzug des zweiten Spielers', async () => {
    const { a, b } = await pair(api, undefined, noon(START));
    expect(a.view.task).toBeNull();
    expect(b.view.task).toMatchObject({ taskId: chapter.taskOrder[0], availableOn: START, completedAt: null });
    expect((await sync(api, a.token, [], noon(START))).json.view.task).toMatchObject({ taskId: chapter.taskOrder[0] });
  });

  it('die nächste Aufgabe erscheint erst nach beidseitigem Abschluss und frühestens am Folgetag', async () => {
    const players = await pair(api, undefined, noon(START));
    const { a, b } = players;
    const next = nextDay(START);

    // Offen: Auch Tage später bleibt es bei der ersten Aufgabe.
    expect((await sync(api, b.token, [], noon(nextDay(next)))).json.view.task).toMatchObject({ taskId: chapter.taskOrder[0], completedAt: null });

    // Ein zweites Haus spielt am Tag des Erscheinens.
    const same = await pair(api, ['Cleo', 'Dan'], noon(START));
    await playTask(api, same, noon(START));
    const evening = await sync(api, same.a.token, [], berlin(START, '23:59:30'));
    expect(evening.json.view.done).toHaveLength(1);
    expect(evening.json.view.task).toMatchObject({ taskId: chapter.taskOrder[0], completedAt: noon(START) });
    expect(evening.json.view.nextTaskOn).toBe(next);

    // Kurz nach Mitternacht in Berlin – in UTC ist es noch der alte Tag.
    const midnight = berlin(next, '00:00:30');
    expect(dayKey(midnight, 'UTC')).toBe(START);
    const morning = await sync(api, same.b.token, [], midnight);
    expect(morning.json.view.task).toMatchObject({ taskId: chapter.taskOrder[1], availableOn: next, completedAt: null });
    expect(morning.json.view.nextTaskOn).toBeNull();
    // Der neue Stand ist gespeichert: Auch das andere Gerät sieht dieselbe Aufgabe mit demselben Tag.
    expect((await sync(api, same.a.token, [], noon(nextDay(next)))).json.view.task).toMatchObject({ taskId: chapter.taskOrder[1], availableOn: next });

    // Das erste Haus hat pausiert und holt nach: Die zweite Aufgabe rückt sofort nach.
    const late = noon(nextDay(next));
    const played = await playTask(api, players, late);
    expect(played.at(-1)!.reply.json.view.task).toMatchObject({ taskId: chapter.taskOrder[1], availableOn: nextDay(next), completedAt: null });
    expect((await sync(api, a.token, [], late)).json.view.done).toHaveLength(1);
  });

  it('eine erledigte Aufgabe bringt den Bauzug, der erste Meilenstein das Geschenk', async () => {
    const first = chapter.milestones[0]!;
    const players = await pair(api, undefined, noon(START));
    const day = await playTasks(api, players, first, START);
    const view = (await sync(api, players.a.token, [], noon(day))).json.view;
    expect(view.done).toHaveLength(first);
    expect(view.buildTurns.map((t) => t.n)).toEqual(Array.from({ length: first }, (_, i) => i + 1));
    expect(view.milestones).toMatchObject([{ at: first }]);
  });

  it('eine Aktion zu einer Aufgabe, die nicht mehr dran ist, wird abgelehnt – der Abgleich läuft weiter', async () => {
    const players = await pair(api, undefined, noon(START));
    const first = chapter.tasks[0]!;
    await playTask(api, players, noon(START));
    // Das Gerät war offline und reicht seinen Schritt zur längst erledigten Aufgabe nach – jedes mit seiner eigenen Aktion.
    const stale = () =>
      first.type === 'puzzle'
        ? action({ type: 'puzzle.solve', taskId: first.id })
        : first.type === 'reallife'
          ? action({ type: 'reallife.confirm', taskId: first.id })
          : action({ type: 'knowme.submit', taskId: first.id, own: { kind: 'choice', option: 0 }, guess: { kind: 'choice', option: 0 } });
    for (const token of [players.a.token, players.b.token]) {
      const reply = await sync(api, token, [stale(), action({ type: 'coupon.deposit', text: 'Later' })], noon(nextDay(START)));
      expect(reply.status).toBe(200);
      // Die überholte Aktion wird abgelehnt, die folgende im selben Abgleich gilt.
      expect(reply.json.results).toMatchObject([{ outcome: 'rejected' }, { outcome: 'applied' }]);
      expect(reply.json.view.done).toHaveLength(1);
      expect(reply.json.view.task).toMatchObject({ taskId: chapter.taskOrder[1] });
    }
  });
});

describe('Stand einer früheren Version', () => {
  it('ein Haus, wie Phase 3 es gespeichert hat, lässt sich abgleichen und spielt weiter', async () => {
    const players = await pair(api, undefined, noon(START));
    const houseId = players.a.view.houseId;
    const db = await api.db();
    const row = await db.prepare('SELECT state FROM houses WHERE id = ?').bind(houseId).first<{ state: string }>();
    const question = chapter.tasks.find((t) => t.type === 'knowme' && t.answer.kind === 'choice')!;
    // Damals gab es keine laufende Aufgabe, und der erledigten Frage aus dem Test-Knopf fehlt das Feld `judged`.
    const old = {
      ...(JSON.parse(row!.state) as object),
      task: null,
      done: [
        {
          taskId: question.id,
          completedAt: noon(START),
          progress: {
            type: 'knowme',
            submissions: {
              a: { own: { kind: 'choice', option: 0 }, guess: { kind: 'choice', option: 1 } },
              b: { own: { kind: 'choice', option: 1 }, guess: { kind: 'choice', option: 1 } },
            },
            hearts: ['a'],
          },
        },
      ],
    };
    await db.prepare('UPDATE houses SET state = ? WHERE id = ?').bind(JSON.stringify(old), houseId).run();

    const next = chapter.taskOrder.find((id) => id !== question.id);
    for (const token of [players.a.token, players.b.token]) {
      const reply = await sync(api, token, [], noon(START));
      expect(reply.status).toBe(200);
      expect(reply.json.view.done).toMatchObject([{ taskId: question.id, progress: { type: 'knowme', hearts: ['a'], judged: [] } }]);
      expect(reply.json.view.task).toMatchObject({ taskId: next, completedAt: null });
    }
    await playTask(api, players, noon(START));
    expect((await sync(api, players.b.token, [], noon(START))).json.view.done.map((d) => d.taskId)).toEqual([question.id, next]);
  });
});

describe('Morgen-Mitteilung', () => {
  /** Meldet ein Gerät am lokalen Push-Dienst an und liefert eine Funktion, die seine Mitteilungen liest. */
  async function subscribe(token: string): Promise<() => PushPayload[]> {
    const device = newDeviceKeys();
    const endpoint = service.endpoint(crypto.randomUUID());
    expect((await call(api, 'PUT', '/push/subscription', { token, body: { endpoint, keys: device.keys } })).status).toBe(200);
    return () => service.received.filter((push) => endpoint.endsWith(push.path)).map((push) => JSON.parse(decryptPush(push.body, device).toString('utf8')) as PushPayload);
  }

  const runCron = (time: string) => api.harness.getWorker().scheduled({ cron: '0 6 * * *', scheduledTime: new Date(time) });
  /** Zeit für Mitteilungen, die es nicht geben soll: Der Worker verschickt nach der Antwort. */
  const settle = () => new Promise((done) => setTimeout(done, 400));
  async function until(check: () => boolean, what: string): Promise<void> {
    const deadline = Date.now() + 5000;
    while (!check()) {
      if (Date.now() > deadline) throw new Error(`nicht eingetreten: ${what}`);
      await new Promise((tick) => setTimeout(tick, 20));
    }
  }

  it('wo über Nacht eine Aufgabe fällig wurde, bekommen beide "neue Aufgabe" – und nur an diesem Morgen', async () => {
    const players = await pair(api, undefined, noon(START));
    const inboxA = await subscribe(players.a.token);
    const inboxB = await subscribe(players.b.token);
    await playTask(api, players, noon(START));
    const next = nextDay(START);
    const newTasks = (inbox: () => PushPayload[]) => inbox().filter((push) => push.kind === 'new_task');

    // Am Morgen danach hat noch niemand die App geöffnet: Der Cron-Lauf lässt die Aufgabe erscheinen und sagt beiden Bescheid.
    await runCron(berlin(next, '07:00:00'));
    await until(() => newTasks(inboxA).length > 0 && newTasks(inboxB).length > 0, 'beide bekommen "neue Aufgabe"');
    await settle();
    expect(newTasks(inboxA)).toHaveLength(1);
    expect(newTasks(inboxB)).toHaveLength(1);
    const view = (await sync(api, players.a.token, [], berlin(next, '07:05:00'))).json.view;
    expect(view.task).toMatchObject({ taskId: chapter.taskOrder[1], availableOn: next, completedAt: null });

    // Am Tag darauf liegt die Aufgabe noch da: Dafür gibt es keine zweite Mitteilung – keine Mahnung.
    await runCron(berlin(nextDay(next), '07:00:00'));
    await settle();
    expect(newTasks(inboxA)).toHaveLength(1);
    expect(newTasks(inboxB)).toHaveLength(1);
  });

  it('ohne neue Aufgabe bleibt es still', async () => {
    const players = await pair(api, undefined, noon(START));
    const inbox = await subscribe(players.a.token);
    // Die erste Aufgabe ist offen und von gestern.
    await runCron(berlin(nextDay(START), '07:00:00'));
    await settle();
    expect(inbox()).toEqual([]);
  });
});

describe('Uhr im Betrieb', () => {
  it('ohne TEST_CLOCK überliest der Worker den Kopf X-Test-Now', async () => {
    const strict = await startLocalApi({ origin: ORIGIN, vars: { TEST_CLOCK: '' } });
    try {
      const { a } = await pair(strict, undefined, '2031-05-05T12:00:00.000Z');
      const reply = await sync(strict, a.token, [], '2031-05-05T12:00:00.000Z');
      expect(reply.json.view.today).not.toBe('2031-05-05');
      expect([dayKey(new Date(Date.now() - 60_000).toISOString()), dayKey(new Date().toISOString())]).toContain(reply.json.view.today);
    } finally {
      await strict.close();
    }
  });
});
