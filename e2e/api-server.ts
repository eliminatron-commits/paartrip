// Startet den Worker lokal auf einem festen Port: node e2e/api-server.ts <Port> <Adresse der App>
// Fester Port, weil die Adresse des Workers beim Bauen in die App geschrieben wird; das Test-Geschirr
// von Wrangler wählt seinen Port selbst, also leitet dieser kleine Server dorthin weiter.
// Genutzt von den Zwei-Geräte-Tests (Playwright) und von `npm run dev:api`.
import { readFileSync } from 'node:fs';
import { createServer, request } from 'node:http';
import { stepsToFinish } from '../shared/autoplay.ts';
import type { RulesContent } from '../shared/content-schema.ts';
import type { HouseState } from '../shared/model.ts';
import { advance, applyAction, chapterOf, type RuleContext } from '../shared/rules.ts';
import { startLocalApi } from '../worker/test/local-api.ts';

const port = Number(process.argv[2] ?? 8788);
const origin = process.argv[3] ?? 'http://localhost:4173';

const api = await startLocalApi({ origin });
const upstream = new URL(api.url);

// ---------------------------------------------------------------- Hilfsrouten
// Nur in diesem lokalen Server, nicht im Worker: stellen Zustände her, die im Spiel Tage brauchen würden.
// Alle: POST /__test/<name>?code=<Kopplungscode>

interface Row {
  id: string;
  state: HouseState;
}

async function load(code: string): Promise<Row | null> {
  const row = await (await api.db()).prepare('SELECT id, state FROM houses WHERE code = ?').bind(code).first<{ id: string; state: string }>();
  return row ? { id: row.id, state: JSON.parse(row.state) as HouseState } : null;
}

async function save(row: Row, state: HouseState): Promise<void> {
  await (await api.db()).prepare('UPDATE houses SET state = ?, rev = ? WHERE id = ?').bind(JSON.stringify(state), crypto.randomUUID(), row.id).run();
}

const rules = (): RuleContext => ({ content: JSON.parse(readFileSync('generated/content-rules.json', 'utf8')) as RulesContent, now: new Date().toISOString() });

/** Lässt den Server ein Haus samt Geräten vergessen, so als wäre die Datenbank zurückgesetzt worden. */
async function forgetHouse(code: string): Promise<boolean> {
  const db = await api.db();
  const house = await load(code);
  if (!house) return false;
  for (const table of ['push_subscriptions', 'applied_actions', 'devices']) {
    await db.prepare(`DELETE FROM ${table} WHERE house_id = ?`).bind(house.id).run();
  }
  await db.prepare('DELETE FROM houses WHERE id = ?').bind(house.id).run();
  return true;
}

/** Besetzt jeden freien Platz des Hauses, so als wäre es vollständig eingerichtet. */
async function fillHouse(code: string): Promise<boolean> {
  const row = await load(code);
  if (!row) return false;
  const state = row.state;
  const spots = chapterOf(state, rules().content).rooms.flatMap((room) => room.spots);
  const taken = new Set(state.placements.map((p) => p.spotId));
  for (const spot of spots) {
    if (!taken.has(spot.id)) state.placements.push({ pieceId: `filler-${spot.id}`, spotId: spot.id });
  }
  await save(row, state);
  return true;
}

/** Als wäre ein Tag vergangen: Ist die laufende Aufgabe erledigt, erscheint die nächste. */
function nextDay(state: HouseState, ctx: RuleContext): HouseState {
  if (!state.task?.completedAt) return state;
  // Die erledigte Aufgabe gilt als längst erschienen – dann lässt die Tagesregel die nächste zu.
  const moved = advance({ ...state, task: { ...state.task, availableOn: '2000-01-01' } }, ctx);
  // Gibt es keine weitere Aufgabe, bleibt alles, wie es war.
  return moved.task?.taskId === state.task.taskId ? state : moved;
}

/** Beide erledigen die laufende Aufgabe, über die echten Regeln. Liefert null, wenn keine offen ist. */
function finish(state: HouseState, ctx: RuleContext): HouseState | null {
  const steps = stepsToFinish(state.task, chapterOf(state, ctx.content));
  if (steps.length === 0) return null;
  for (const step of steps) {
    const applied = applyAction(state, step.slot, { ...step.action, id: crypto.randomUUID(), at: ctx.now }, ctx);
    if (applied.result.outcome !== 'applied') throw new Error(`Schritt abgelehnt: ${JSON.stringify(step.action)}`);
    state = applied.state;
  }
  return state;
}

/** Lässt, falls die laufende Aufgabe erledigt ist, die nächste erscheinen. */
async function nextTask(code: string): Promise<boolean> {
  const row = await load(code);
  if (!row) return false;
  await save(row, nextDay(row.state, rules()));
  return true;
}

/** Erledigt die laufende Aufgabe so, wie zwei Spieler es täten (eine schon erledigte gilt als von gestern). */
async function finishTask(code: string): Promise<boolean> {
  const row = await load(code);
  if (!row) return false;
  const ctx = rules();
  const finished = finish(nextDay(row.state, ctx), ctx);
  if (!finished) return false;
  await save(row, finished);
  return true;
}

/**
 * Spielt so weit, bis die Aufgabe `task` die laufende, offene ist. Die Meilensteine auf dem Weg dorthin gelten
 * als von beiden gesehen – wer zu einer späten Aufgabe will, müsste sonst auf jedem Gerät erst durch jede Szene.
 */
async function openTask(code: string, params: URLSearchParams): Promise<boolean> {
  const row = await load(code);
  const wanted = params.get('task');
  if (!row || !wanted) return false;
  const ctx = rules();
  let state = nextDay(row.state, ctx);
  while (state.task?.taskId !== wanted) {
    const finished = finish(state, ctx);
    if (!finished) return false;
    state = nextDay(finished, ctx);
    if (state === finished) return false;
  }
  if (state.task.completedAt !== null) return false;
  for (const milestone of state.milestones) {
    for (const slot of ['a', 'b'] as const) {
      if (milestone.seenBy.includes(slot)) continue;
      state = applyAction(state, slot, { type: 'milestone.seen', milestone: milestone.at, id: crypto.randomUUID(), at: ctx.now }, ctx).state;
    }
  }
  await save(row, state);
  return true;
}

const TEST_ROUTES: Record<string, (code: string, params: URLSearchParams) => Promise<boolean>> = {
  '/__test/forget-house': forgetHouse,
  '/__test/fill-house': fillHouse,
  '/__test/next-task': nextTask,
  '/__test/finish-task': finishTask,
  '/__test/open-task': openTask,
};

createServer((req, res) => {
  const url = new URL(req.url ?? '/', `http://localhost:${port}`);
  const helper = req.method === 'POST' ? TEST_ROUTES[url.pathname] : undefined;
  if (helper) {
    helper(url.searchParams.get('code') ?? '', url.searchParams).then(
      (found) => res.writeHead(found ? 204 : 404).end(),
      (error: unknown) => {
        console.error(error);
        res.writeHead(500).end();
      },
    );
    return;
  }
  const forward = request(
    { host: upstream.hostname, port: upstream.port, path: req.url, method: req.method, headers: { ...req.headers, host: upstream.host } },
    (answer) => {
      res.writeHead(answer.statusCode ?? 502, answer.headers);
      answer.pipe(res);
    },
  );
  forward.on('error', () => res.writeHead(502).end());
  req.pipe(forward);
}).listen(port, () => {
  console.log(`Lokaler Worker auf http://localhost:${port} (nimmt Anfragen von ${origin} an)`);
});
