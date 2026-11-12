// Der eine Worker: Koppeln, Abgleich und Push. Er hält je Haus den Stand in D1 (Quelle der Wahrheit),
// wendet Aktionen über die Regeln aus shared/ an und gibt jedem Gerät nur die für es gefilterte Sicht.
import rulesContent from '../../generated/content-rules.json';
import type { ActionResult } from '../../shared/actions.ts';
import type { ApiError, ApiErrorCode, EnterHouseResponse, OkResponse, PushKeyResponse, SyncResponse } from '../../shared/api.ts';
import type { RulesContent } from '../../shared/content-schema.ts';
import type { HouseState } from '../../shared/model.ts';
import { advance, announceTask, applyAction, createHouse, joinHouse, type PushEffect, type RuleContext } from '../../shared/rules.ts';
import { deriveView, type ViewContext } from '../../shared/view.ts';
import { CODE_LENGTH, normalizeCode } from '../../shared/limits.ts';
import { createHouseSchema, joinHouseSchema, pushSubscribeSchema, syncSchema } from '../../shared/wire.ts';
import { deliver, pushKeys, sendTest } from './push.ts';
import {
  addSecondDevice,
  allHouseIds,
  countHouses,
  deleteSubscription,
  type Device,
  findDevice,
  findHouseByCode,
  hashToken,
  insertHouse,
  knownActionIds,
  loadHouse,
  newCode,
  newToken,
  putSubscription,
  saveHouse,
  type SeenAction,
  subscriptionOf,
} from './store.ts';

export interface Env {
  DB: D1Database;
  /** Einzige Herkunft, deren Anfragen der Worker annimmt: die Pages-Adresse der App. */
  ALLOWED_ORIGIN: string;
  /** Obergrenze an Häusern. Die App ist für ein Paar gedacht; die Grenze schützt den Gratis-Tarif. */
  MAX_HOUSES: string;
  VAPID_PUBLIC_KEY: string;
  /** Secret, nie im Repo. */
  VAPID_PRIVATE_KEY?: string;
  VAPID_SUBJECT: string;
  /** Erlaubte Push-Dienste (Endungen der Hostnamen, durch Komma getrennt). */
  PUSH_HOSTS: string;
  /** Wartezeit vor der Probe-Mitteilung, damit man die App vorher schließen kann. */
  PUSH_TEST_DELAY_MS: string;
  /**
   * "1": Die Serverzeit lässt sich je Anfrage über den Kopf X-Test-Now stellen – nur lokal und in den Tests,
   * damit sich der Tageswechsel prüfen lässt. Im Betrieb fehlt die Variable, der Kopf wird dann überlesen.
   */
  TEST_CLOCK?: string;
}

// Beim Bauen geprüft (scripts/build-content.ts); hier genügt die Typzuweisung.
const content = rulesContent as unknown as RulesContent;

/** Wie oft ein Schreibversuch wiederholt wird, wenn das andere Gerät gleichzeitig geschrieben hat. */
const WRITE_ATTEMPTS = 4;

/** Kurze, zufällige Pause vor einem neuen Versuch, damit zwei Geräte nicht im Gleichschritt kollidieren. */
function pauseBeforeRetry(): Promise<void> {
  return new Promise((done) => setTimeout(done, 5 + Math.random() * 25));
}
const MAX_BODY_CHARS = 100_000;

class HttpError extends Error {
  status: number;
  code: ApiErrorCode;
  constructor(status: number, code: ApiErrorCode, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

function json(body: unknown, status: number, headers: Record<string, string>): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...headers, 'Content-Type': 'application/json; charset=utf-8' } });
}

async function readBody<T>(request: Request, schema: { safeParse(input: unknown): { success: true; data: T } | { success: false } }): Promise<T> {
  const text = await request.text();
  if (text.length > MAX_BODY_CHARS) throw new HttpError(413, 'bad_request', 'Request too large.');
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new HttpError(400, 'bad_request', 'Request is not valid JSON.');
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) throw new HttpError(400, 'bad_request', 'Request does not match the expected shape.');
  return parsed.data;
}

async function requireDevice(request: Request, env: Env): Promise<Device> {
  const token = /^Bearer (\S+)$/.exec(request.headers.get('Authorization') ?? '')?.[1];
  const device = token ? await findDevice(env.DB, token) : null;
  if (!device) throw new HttpError(401, 'unauthorized', 'This device is not linked to a house.');
  return device;
}

/** Die Sicht entsteht aus denselben Inhalten und derselben Serverzeit wie die Regeln. */
function viewContext(rules: RuleContext, pairingCode: string): ViewContext {
  return { content: rules.content, now: rules.now, pairingCode };
}

/** Serverzeit. Nur mit TEST_CLOCK (lokal, Tests) gilt stattdessen die Zeit aus dem Kopf X-Test-Now. */
function serverNow(request: Request, env: Env): string {
  const set = env.TEST_CLOCK === '1' ? request.headers.get('X-Test-Now') : null;
  const time = set ? new Date(set) : new Date();
  return (Number.isNaN(time.getTime()) ? new Date() : time).toISOString();
}

// ---------------------------------------------------------------- Koppeln

async function handleCreateHouse(request: Request, env: Env, rules: RuleContext): Promise<EnterHouseResponse> {
  const { name } = await readBody(request, createHouseSchema);
  if ((await countHouses(env.DB)) >= Number(env.MAX_HOUSES)) {
    throw new HttpError(403, 'house_limit', 'No more houses can be created on this server.');
  }
  const state = createHouse(crypto.randomUUID(), name, rules);
  const token = newToken();
  const tokenHash = await hashToken(token);
  for (let attempt = 0; attempt < WRITE_ATTEMPTS; attempt++) {
    const code = newCode();
    if (await insertHouse(env.DB, state, code, tokenHash, rules.now)) {
      return { token, view: deriveView(state, 'a', viewContext(rules, code)) };
    }
  }
  throw new HttpError(503, 'busy', 'Please try again.');
}

async function handleJoinHouse(request: Request, env: Env, rules: RuleContext): Promise<EnterHouseResponse> {
  const body = await readBody(request, joinHouseSchema);
  const code = normalizeCode(body.code);
  for (let attempt = 0; attempt < WRITE_ATTEMPTS; attempt++) {
    const house = code.length === CODE_LENGTH ? await findHouseByCode(env.DB, code) : null;
    if (!house) throw new HttpError(404, 'invalid_code', 'No house with this code.');
    const next = joinHouse(house.state, body.name, rules);
    // Das Haus ist nach dem zweiten Spieler geschlossen – jeder weitere Beitritt endet hier.
    if (!next) throw new HttpError(409, 'house_full', 'This house already has two people.');
    const token = newToken();
    if (await addSecondDevice(env.DB, house, next, await hashToken(token), rules.now)) {
      return { token, view: deriveView(next, 'b', viewContext(rules, house.code)) };
    }
    await pauseBeforeRetry();
  }
  throw new HttpError(503, 'busy', 'Please try again.');
}

// ---------------------------------------------------------------- Abgleich

async function handleSync(request: Request, env: Env, ctx: ExecutionContext, rules: RuleContext): Promise<SyncResponse> {
  const device = await requireDevice(request, env);
  const { actions } = await readBody(request, syncSchema);

  for (let attempt = 0; attempt < WRITE_ATTEMPTS; attempt++) {
    const house = await loadHouse(env.DB, device.houseId);
    if (!house) throw new HttpError(404, 'not_found', 'This house no longer exists.');
    const known = await knownActionIds(
      env.DB,
      house.id,
      actions.map((a) => a.id),
    );

    // Hat seit dem letzten Abgleich ein neuer Tag begonnen, erscheint jetzt die nächste Aufgabe.
    let state: HouseState = advance(house.state, rules);
    const results: ActionResult[] = [];
    const seen: SeenAction[] = [];
    const effects: PushEffect[] = [];
    for (const action of actions) {
      // Jede id wird höchstens einmal angewendet – auch wenn sie nach einem Abbruch erneut ankommt.
      if (known.has(action.id)) {
        results.push({ id: action.id, outcome: 'duplicate' });
        continue;
      }
      known.add(action.id);
      const applied = applyAction(state, device.slot, action, rules);
      state = applied.state;
      results.push(applied.result);
      seen.push({ id: action.id, outcome: applied.result.outcome });
      effects.push(...applied.effects);
    }

    const unchanged = seen.length === 0 && state === house.state;
    const saved = unchanged || (await saveHouse(env.DB, house, state, device.slot, seen, rules.now));
    if (saved) {
      if (effects.length > 0) ctx.waitUntil(deliver(env, state, effects));
      // Die Sicht ist das Einzige, was das Gerät vom Stand erfährt.
      return { view: deriveView(state, device.slot, viewContext(rules, house.code)), results };
    }
    await pauseBeforeRetry();
  }
  throw new HttpError(503, 'busy', 'Please try again.');
}

// ---------------------------------------------------------------- Push

async function handlePushSubscribe(request: Request, env: Env, now: string): Promise<OkResponse> {
  const device = await requireDevice(request, env);
  const body = await readBody(request, pushSubscribeSchema);
  const url = new URL(body.endpoint);
  // Nur bekannte Push-Dienste: Der Worker schickt später Anfragen an diese Adresse.
  const hosts = env.PUSH_HOSTS.split(',').map((h) => h.trim()).filter(Boolean);
  const allowed = hosts.some((host) => url.hostname === host || url.hostname.endsWith(`.${host}`));
  const secure = url.protocol === 'https:' || url.hostname === '127.0.0.1';
  if (!allowed || !secure) throw new HttpError(400, 'bad_request', 'Unknown push service.');
  await putSubscription(env.DB, device, { endpoint: body.endpoint, p256dh: body.keys.p256dh, auth: body.keys.auth }, now);
  return { ok: true };
}

async function handlePushTest(request: Request, env: Env, ctx: ExecutionContext): Promise<OkResponse> {
  const device = await requireDevice(request, env);
  if (!pushKeys(env)) throw new HttpError(503, 'push_unavailable', 'Notifications are not set up on the server.');
  const subscription = await subscriptionOf(env.DB, device.tokenHash);
  if (!subscription) throw new HttpError(409, 'no_subscription', 'Notifications are not enabled on this device.');
  ctx.waitUntil(sendTest(env, subscription));
  return { ok: true };
}

// ---------------------------------------------------------------- Morgen-Mitteilung

/**
 * Läuft einmal am Morgen (Cron-Trigger in wrangler.jsonc): Wo über Nacht eine neue Aufgabe fällig wurde,
 * erscheint sie jetzt, und wer seinen Teil noch nicht getan hat, bekommt "neue Aufgabe". Das Spiel selbst
 * hängt nicht daran – beim Abgleich erscheint die Aufgabe genauso; hier geht es nur um die Mitteilung.
 */
async function announceNewTasks(env: Env, now: string): Promise<void> {
  const rules: RuleContext = { content, now };
  for (const id of await allHouseIds(env.DB)) {
    try {
      for (let attempt = 0; attempt < 2; attempt++) {
        const house = await loadHouse(env.DB, id);
        if (!house) break;
        const state = advance(house.state, rules);
        // Hat gerade ein Gerät geschrieben: neu laden und noch einmal ansehen.
        if (state !== house.state && !(await saveHouse(env.DB, house, state, 'a', [], now))) continue;
        await deliver(env, state, announceTask(state, rules));
        break;
      }
    } catch (error) {
      // Ein Haus mit einem Fehler darf die anderen nicht um ihre Mitteilung bringen.
      console.error(`Morgen-Mitteilung für Haus ${id} gescheitert`, error);
    }
  }
}

// ---------------------------------------------------------------- Einstieg

async function route(request: Request, env: Env, ctx: ExecutionContext): Promise<{ status: number; body: unknown }> {
  const { pathname } = new URL(request.url);
  const rules: RuleContext = { content, now: serverNow(request, env) };
  const key = `${request.method} ${pathname}`;
  switch (key) {
    case 'POST /houses':
      return { status: 201, body: await handleCreateHouse(request, env, rules) };
    case 'POST /houses/join':
      return { status: 201, body: await handleJoinHouse(request, env, rules) };
    case 'POST /sync':
      return { status: 200, body: await handleSync(request, env, ctx, rules) };
    case 'GET /push/key': {
      await requireDevice(request, env);
      if (!pushKeys(env)) throw new HttpError(503, 'push_unavailable', 'Notifications are not set up on the server.');
      return { status: 200, body: { publicKey: env.VAPID_PUBLIC_KEY } satisfies PushKeyResponse };
    }
    case 'PUT /push/subscription':
      return { status: 200, body: await handlePushSubscribe(request, env, rules.now) };
    case 'DELETE /push/subscription': {
      const device = await requireDevice(request, env);
      await deleteSubscription(env.DB, device.tokenHash);
      return { status: 200, body: { ok: true } satisfies OkResponse };
    }
    case 'POST /push/test':
      return { status: 200, body: await handlePushTest(request, env, ctx) };
    default:
      throw new HttpError(404, 'not_found', 'Unknown route.');
  }
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const { pathname } = new URL(request.url);
    // Lebenszeichen ohne Daten – zum Nachsehen im Browser, ob der Worker läuft.
    if (request.method === 'GET' && pathname === '/') return new Response('paartrip-api ok\n', { headers: { 'Content-Type': 'text/plain' } });

    // Nur die App-Adresse darf anfragen. Fremde Herkunft bekommt weder Daten noch CORS-Freigabe.
    if (request.headers.get('Origin') !== env.ALLOWED_ORIGIN) {
      return json({ error: 'forbidden', message: 'Requests are only accepted from the app.' } satisfies ApiError, 403, {});
    }
    const cors = { 'Access-Control-Allow-Origin': env.ALLOWED_ORIGIN, Vary: 'Origin' };
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: {
          ...cors,
          'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE',
          'Access-Control-Allow-Headers': 'Authorization, Content-Type',
          'Access-Control-Max-Age': '86400',
        },
      });
    }

    try {
      const { status, body } = await route(request, env, ctx);
      return json(body, status, cors);
    } catch (error) {
      if (error instanceof HttpError) return json({ error: error.code, message: error.message } satisfies ApiError, error.status, cors);
      console.error(error);
      return json({ error: 'server_error', message: 'Something went wrong on the server.' } satisfies ApiError, 500, cors);
    }
  },

  async scheduled(controller: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(announceNewTasks(env, new Date(controller.scheduledTime).toISOString()));
  },
} satisfies ExportedHandler<Env>;
