// Leitung zum Worker. Kennt nur Routen und Fehler – was mit den Antworten geschieht, entscheidet der Abgleich.
import {
  type ApiError,
  type ApiErrorCode,
  type CreateHouseRequest,
  type EnterHouseResponse,
  type JoinHouseRequest,
  type OkResponse,
  type PushKeyResponse,
  type PushSubscribeRequest,
  type Route,
  ROUTES,
  type SyncRequest,
  type SyncResponse,
} from '../../shared/api.ts';

/** 'offline': Die Anfrage hat den Server nicht erreicht. Alles andere hat der Server geantwortet. */
export type FailureCode = ApiErrorCode | 'offline';

export class ApiFailure extends Error {
  code: FailureCode;
  constructor(code: FailureCode, message: string) {
    super(message);
    this.code = code;
  }
}

export interface Transport {
  createHouse(body: CreateHouseRequest): Promise<EnterHouseResponse>;
  joinHouse(body: JoinHouseRequest): Promise<EnterHouseResponse>;
  sync(token: string, body: SyncRequest): Promise<SyncResponse>;
  pushKey(token: string): Promise<PushKeyResponse>;
  pushSubscribe(token: string, body: PushSubscribeRequest): Promise<OkResponse>;
  pushUnsubscribe(token: string): Promise<OkResponse>;
  pushTest(token: string): Promise<OkResponse>;
}

/** Nach dieser Zeit gilt eine Anfrage als nicht angekommen – ein hängendes Netz darf den Abgleich nicht blockieren. */
const TIMEOUT_MS = 15_000;

export function createTransport(baseUrl: string, fetchFn: typeof fetch = (...args) => fetch(...args)): Transport {
  async function request<T>(route: Route, token?: string, body?: unknown): Promise<T> {
    const headers: Record<string, string> = {};
    if (token) headers.Authorization = `Bearer ${token}`;
    if (body !== undefined) headers['Content-Type'] = 'application/json';

    let response: Response;
    try {
      response = await fetchFn(baseUrl + route.path, {
        method: route.method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch {
      throw new ApiFailure('offline', 'No connection.');
    }
    const data: unknown = await response.json().catch(() => null);
    if (!response.ok) {
      const error = data as Partial<ApiError> | null;
      throw new ApiFailure(error?.error ?? 'server_error', error?.message ?? `Request failed (${response.status}).`);
    }
    return data as T;
  }

  return {
    createHouse: (body) => request(ROUTES.createHouse, undefined, body),
    joinHouse: (body) => request(ROUTES.joinHouse, undefined, body),
    sync: (token, body) => request(ROUTES.sync, token, body),
    pushKey: (token) => request(ROUTES.pushKey, token),
    pushSubscribe: (token, body) => request(ROUTES.pushSubscribe, token, body),
    pushUnsubscribe: (token) => request(ROUTES.pushUnsubscribe, token),
    pushTest: (token) => request(ROUTES.pushTest, token),
  };
}
