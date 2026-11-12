// Kleiner HTTP-Client für die Worker-Tests: spricht den lokal gestarteten Worker so an wie die App.
import generated from '../../generated/content-rules.json';
import type { ActionBody } from '../../shared/actions.ts';
import type { EnterHouseResponse, SyncResponse } from '../../shared/api.ts';
import { finishingSteps } from '../../shared/autoplay.ts';
import type { RulesContent } from '../../shared/content-schema.ts';
import type { Slot } from '../../shared/model.ts';
import { nextDay } from '../../shared/time.ts';
import type { LocalApi } from './local-api.ts';

const chapter = (generated as unknown as RulesContent).chapters[0]!;

export const ORIGIN = 'http://localhost:4173';

export interface Reply<T = unknown> {
  status: number;
  /** Rohtext der Antwort – für Prüfungen, dass etwas nirgends in der Antwort steht. */
  text: string;
  json: T;
  headers: Headers;
}

export interface CallOptions {
  body?: unknown;
  token?: string;
  /** null = ohne Origin-Kopf. */
  origin?: string | null;
  /** Gestellte Serverzeit (Kopf X-Test-Now; der lokale Worker nimmt ihn an). */
  now?: string;
}

export async function call<T = unknown>(api: LocalApi, method: string, path: string, options: CallOptions = {}): Promise<Reply<T>> {
  const headers: Record<string, string> = {};
  const origin = options.origin === undefined ? ORIGIN : options.origin;
  if (origin !== null) headers.Origin = origin;
  if (options.token) headers.Authorization = `Bearer ${options.token}`;
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';
  if (options.now) headers['X-Test-Now'] = options.now;
  const response = await fetch(api.url + path, {
    method,
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  const text = await response.text();
  let json: unknown = null;
  try {
    json = JSON.parse(text);
  } catch {
    // keine JSON-Antwort (z. B. Preflight)
  }
  return { status: response.status, text, json: json as T, headers: response.headers };
}

let counter = 0;

/** Aktion mit frischer id, wie das Gerät sie erzeugt. */
export function action(body: ActionBody) {
  counter += 1;
  return { ...body, id: crypto.randomUUID(), at: new Date(Date.UTC(2026, 0, 1, 0, 0, counter)).toISOString() };
}

export interface Pair {
  a: EnterHouseResponse;
  b: EnterHouseResponse;
  code: string;
}

/** Legt ein Haus an und lässt den zweiten Spieler beitreten – auf Wunsch zu einer gestellten Serverzeit. */
export async function pair(api: LocalApi, names: [string, string] = ['Ada', 'Bao'], now?: string): Promise<Pair> {
  const a = await call<EnterHouseResponse>(api, 'POST', '/houses', { body: { name: names[0] }, now });
  if (a.status !== 201) throw new Error(`Anlegen fehlgeschlagen: ${a.status} ${a.text}`);
  const code = a.json.view.pairingCode ?? '';
  const b = await call<EnterHouseResponse>(api, 'POST', '/houses/join', { body: { code, name: names[1] }, now });
  if (b.status !== 201) throw new Error(`Beitreten fehlgeschlagen: ${b.status} ${b.text}`);
  return { a: a.json, b: b.json, code };
}

export function sync(api: LocalApi, token: string, actions: ReturnType<typeof action>[] = [], now?: string): Promise<Reply<SyncResponse>> {
  return call<SyncResponse>(api, 'POST', '/sync', { token, body: { actions }, now });
}

/** Mittag in Berlin an diesem Kalendertag (Winterzeit), als gestellte Serverzeit. */
export function noon(day: string): string {
  return new Date(`${day}T12:00:00+01:00`).toISOString();
}

export interface Played {
  slot: Slot;
  reply: Reply<SyncResponse>;
}

/**
 * Beide erledigen die laufende Aufgabe über die Schnittstelle, mit den Aktionen, die zwei Spieler schickten.
 * `last`: wer den letzten Schritt tun soll, wenn die Aufgabe die Wahl lässt. Liefert jede Antwort samt Empfänger.
 */
export async function playTask(api: LocalApi, players: Pair, now: string, last: Slot = 'b'): Promise<Played[]> {
  const view = (await sync(api, players.a.token, [], now)).json.view;
  if (!view.task || view.task.completedAt !== null) throw new Error(`keine offene Aufgabe am ${view.today}`);
  const steps = finishingSteps(view.task.taskId, chapter).sort((x, y) => Number(x.slot === last) - Number(y.slot === last));
  const played: Played[] = [];
  for (const step of steps) {
    const reply = await sync(api, players[step.slot].token, [action(step.action)], now);
    if (reply.json.results[0]?.outcome !== 'applied') throw new Error(`Schritt abgelehnt: ${JSON.stringify(step.action)} → ${reply.text}`);
    played.push({ slot: step.slot, reply });
  }
  return played;
}

/** Spielt `count` Aufgaben, eine pro Tag ab `day`. Liefert den Tag nach der letzten. */
export async function playTasks(api: LocalApi, players: Pair, count: number, day: string): Promise<string> {
  for (let i = 0; i < count; i++) {
    await playTask(api, players, noon(day));
    day = nextDay(day);
  }
  return day;
}
