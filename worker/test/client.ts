// Kleiner HTTP-Client für die Worker-Tests: spricht den lokal gestarteten Worker so an wie die App.
import type { ActionBody } from '../../shared/actions.ts';
import type { EnterHouseResponse, SyncResponse } from '../../shared/api.ts';
import type { LocalApi } from './local-api.ts';

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
}

export async function call<T = unknown>(api: LocalApi, method: string, path: string, options: CallOptions = {}): Promise<Reply<T>> {
  const headers: Record<string, string> = {};
  const origin = options.origin === undefined ? ORIGIN : options.origin;
  if (origin !== null) headers.Origin = origin;
  if (options.token) headers.Authorization = `Bearer ${options.token}`;
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';
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

/** Legt ein Haus an und lässt den zweiten Spieler beitreten. */
export async function pair(api: LocalApi, names: [string, string] = ['Ada', 'Bao']): Promise<Pair> {
  const a = await call<EnterHouseResponse>(api, 'POST', '/houses', { body: { name: names[0] } });
  if (a.status !== 201) throw new Error(`Anlegen fehlgeschlagen: ${a.status} ${a.text}`);
  const code = a.json.view.pairingCode ?? '';
  const b = await call<EnterHouseResponse>(api, 'POST', '/houses/join', { body: { code, name: names[1] } });
  if (b.status !== 201) throw new Error(`Beitreten fehlgeschlagen: ${b.status} ${b.text}`);
  return { a: a.json, b: b.json, code };
}

export function sync(api: LocalApi, token: string, actions: ReturnType<typeof action>[] = []): Promise<Reply<SyncResponse>> {
  return call<SyncResponse>(api, 'POST', '/sync', { token, body: { actions } });
}
