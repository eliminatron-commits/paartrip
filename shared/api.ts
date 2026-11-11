// Schnittstelle zwischen App und Worker. JSON über HTTPS; CORS nur für die Pages-Adresse.
// Alle Routen außer Anlegen und Beitreten verlangen `Authorization: Bearer <Geräte-Token>`.
import type { Action, ActionResult } from './actions.ts';
import type { HouseView } from './model.ts';

export const ROUTES = {
  /** Haus anlegen (Gerät A). */
  createHouse: { method: 'POST', path: '/houses' },
  /** Mit Kopplungscode beitreten (Gerät B). Danach ist das Haus geschlossen. */
  joinHouse: { method: 'POST', path: '/houses/join' },
  /** Abgleich: wartende Aktionen einreichen (auch keine) und die aktuelle Sicht abholen. */
  sync: { method: 'POST', path: '/sync' },
  /** Öffentlicher VAPID-Schlüssel für die Push-Anmeldung. */
  pushKey: { method: 'GET', path: '/push/key' },
  /** Push-Anmeldung dieses Geräts speichern bzw. löschen. */
  pushSubscribe: { method: 'PUT', path: '/push/subscription' },
  pushUnsubscribe: { method: 'DELETE', path: '/push/subscription' },
  /** Probe-Mitteilung an dieses Gerät, damit sich die Zustellung prüfen lässt. */
  pushTest: { method: 'POST', path: '/push/test' },
} as const;

export type Route = (typeof ROUTES)[keyof typeof ROUTES];

export interface CreateHouseRequest {
  name: string;
}

export interface JoinHouseRequest {
  code: string;
  name: string;
}

/** Antwort auf Anlegen und Beitreten. Das Token weist ab jetzt jede Anfrage dieses Geräts aus. */
export interface EnterHouseResponse {
  token: string;
  view: HouseView;
}

export interface SyncRequest {
  actions: Action[];
}

export interface SyncResponse {
  /** Stand nach Anwendung der eingereichten Aktionen. */
  view: HouseView;
  /** Ein Ergebnis je eingereichter Aktion, in derselben Reihenfolge. */
  results: ActionResult[];
}

export interface PushKeyResponse {
  publicKey: string;
}

/** Die Felder aus PushSubscription.toJSON() im Browser, die der Server braucht. */
export interface PushSubscribeRequest {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

/** Antwort der Routen, die nichts zurückzugeben haben. */
export interface OkResponse {
  ok: true;
}

export type ApiErrorCode =
  | 'bad_request'
  | 'unauthorized' // Token fehlt oder ist unbekannt
  | 'forbidden' // Anfrage kommt nicht von der App-Adresse
  | 'invalid_code' // Kopplungscode unbekannt
  | 'house_full' // dritter Beitritt
  | 'house_limit' // Obergrenze an Häusern erreicht (Schutz des Gratis-Tarifs)
  | 'busy' // gleichzeitige Änderungen, bitte erneut abgleichen
  | 'push_unavailable' // Server hat keine VAPID-Schlüssel
  | 'no_subscription' // Probe-Mitteilung ohne Push-Anmeldung
  | 'not_found'
  | 'server_error';

export interface ApiError {
  error: ApiErrorCode;
  message: string;
}

// ---------------------------------------------------------------- Push (Worker → Service Worker)

export type PushKind =
  | 'partner_done' // Partner hat seinen Teil erledigt
  | 'new_task' // neue Aufgabe verfügbar
  | 'coupon_unlocked' // Gutschein freigeschaltet
  | 'redeem_requested' // Einlösen angefragt
  | 'test'; // Probe-Mitteilung aus den Einstellungen

/** Nutzlast einer Push-Nachricht; der Service Worker zeigt sie als Mitteilung an. */
export interface PushPayload {
  kind: PushKind;
  title: string;
  body: string;
}
