// Zugriff auf D1. Alles, was SQL enthält, steht hier; die Regeln selbst liegen in shared/.
//
// Schreiben ohne Überschreiben: Jede Änderung am Haus gilt nur, wenn `rev` noch den gelesenen Wert hat.
// Die Folge-Anweisungen im selben Stapel hängen an der neuen `rev` – trifft die Änderung nicht, tun auch
// sie nichts. So bleiben Stand, Geräte und Aktionsliste immer zusammen stimmig.
import type { ActionOutcome } from '../../shared/actions.ts';
import type { HouseState, Slot } from '../../shared/model.ts';
import { CODE_ALPHABET, CODE_LENGTH } from '../../shared/limits.ts';
import { b64urlEncode, type PushTarget } from './webpush.ts';

export interface Device {
  tokenHash: string;
  houseId: string;
  slot: Slot;
}

export interface House {
  id: string;
  code: string;
  rev: string;
  state: HouseState;
}

interface HouseRow {
  id: string;
  code: string;
  rev: string;
  state: string;
}

const toHouse = (row: HouseRow): House => ({ id: row.id, code: row.code, rev: row.rev, state: JSON.parse(row.state) as HouseState });

/** Geheimes Geräte-Token: 32 Zufallsbytes. Das Gerät bekommt es genau einmal, der Server behält nur den Hash. */
export function newToken(): string {
  return b64urlEncode(crypto.getRandomValues(new Uint8Array(32)));
}

export async function hashToken(token: string): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token)));
  return [...digest].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

/** Kopplungscode aus gleichverteilten Zeichen (Bytes außerhalb eines Vielfachen des Alphabets werden verworfen). */
export function newCode(): string {
  const limit = 256 - (256 % CODE_ALPHABET.length);
  let code = '';
  while (code.length < CODE_LENGTH) {
    for (const byte of crypto.getRandomValues(new Uint8Array(CODE_LENGTH * 2))) {
      if (byte < limit && code.length < CODE_LENGTH) code += CODE_ALPHABET[byte % CODE_ALPHABET.length];
    }
  }
  return code;
}

export async function findDevice(db: D1Database, token: string): Promise<Device | null> {
  const tokenHash = await hashToken(token);
  const row = await db.prepare('SELECT house_id, slot FROM devices WHERE token_hash = ?').bind(tokenHash).first<{ house_id: string; slot: Slot }>();
  return row ? { tokenHash, houseId: row.house_id, slot: row.slot } : null;
}

export async function loadHouse(db: D1Database, id: string): Promise<House | null> {
  const row = await db.prepare('SELECT id, code, rev, state FROM houses WHERE id = ?').bind(id).first<HouseRow>();
  return row ? toHouse(row) : null;
}

export async function findHouseByCode(db: D1Database, code: string): Promise<House | null> {
  const row = await db.prepare('SELECT id, code, rev, state FROM houses WHERE code = ?').bind(code).first<HouseRow>();
  return row ? toHouse(row) : null;
}

export async function countHouses(db: D1Database): Promise<number> {
  return (await db.prepare('SELECT COUNT(*) AS n FROM houses').first<{ n: number }>())?.n ?? 0;
}

/** Legt Haus und Gerät a an. false: Der Code war schon vergeben (mit neuem Code wiederholen). */
export async function insertHouse(db: D1Database, state: HouseState, code: string, tokenHash: string, now: string): Promise<boolean> {
  try {
    await db.batch([
      db
        .prepare('INSERT INTO houses (id, code, rev, state, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)')
        .bind(state.id, code, crypto.randomUUID(), JSON.stringify(state), now, now),
      db.prepare("INSERT INTO devices (token_hash, house_id, slot, created_at) VALUES (?, ?, 'a', ?)").bind(tokenHash, state.id, now),
    ]);
    return true;
  } catch (error) {
    if (String(error).includes('UNIQUE')) return false;
    throw error;
  }
}

/** Trägt den zweiten Spieler samt Gerät ein. false: Das Haus hat sich inzwischen geändert (neu laden). */
export async function addSecondDevice(db: D1Database, house: House, next: HouseState, tokenHash: string, now: string): Promise<boolean> {
  const rev = crypto.randomUUID();
  const [update] = await db.batch([
    db.prepare('UPDATE houses SET state = ?, rev = ?, updated_at = ? WHERE id = ? AND rev = ?').bind(JSON.stringify(next), rev, now, house.id, house.rev),
    db
      .prepare("INSERT INTO devices (token_hash, house_id, slot, created_at) SELECT ?, ?, 'b', ? WHERE EXISTS (SELECT 1 FROM houses WHERE id = ? AND rev = ?)")
      .bind(tokenHash, house.id, now, house.id, rev),
  ]);
  return update?.meta.changes === 1;
}

/** Welche dieser Aktions-ids der Server für dieses Haus schon gesehen hat. */
export async function knownActionIds(db: D1Database, houseId: string, ids: string[]): Promise<Set<string>> {
  if (ids.length === 0) return new Set();
  const { results } = await db
    .prepare('SELECT action_id FROM applied_actions WHERE house_id = ? AND action_id IN (SELECT value FROM json_each(?))')
    .bind(houseId, JSON.stringify(ids))
    .all<{ action_id: string }>();
  return new Set(results.map((row) => row.action_id));
}

export interface SeenAction {
  id: string;
  outcome: ActionOutcome;
}

/** Speichert den neuen Stand und merkt sich die Aktionen. false: Jemand war schneller (neu laden, neu anwenden). */
export async function saveHouse(db: D1Database, house: House, next: HouseState, slot: Slot, seen: SeenAction[], now: string): Promise<boolean> {
  const rev = crypto.randomUUID();
  const [update] = await db.batch([
    db.prepare('UPDATE houses SET state = ?, rev = ?, updated_at = ? WHERE id = ? AND rev = ?').bind(JSON.stringify(next), rev, now, house.id, house.rev),
    db
      .prepare(
        `INSERT INTO applied_actions (house_id, action_id, slot, outcome, applied_at)
         SELECT ?1, value ->> 'id', ?2, value ->> 'outcome', ?3 FROM json_each(?4)
         WHERE EXISTS (SELECT 1 FROM houses WHERE id = ?1 AND rev = ?5)`,
      )
      .bind(house.id, slot, now, JSON.stringify(seen), rev),
  ]);
  return update?.meta.changes === 1;
}

// ---------------------------------------------------------------- Push-Anmeldungen

interface SubscriptionRow {
  token_hash: string;
  endpoint: string;
  p256dh: string;
  auth: string;
}

export interface Subscription extends PushTarget {
  tokenHash: string;
}

const toSubscription = (row: SubscriptionRow): Subscription => ({ tokenHash: row.token_hash, endpoint: row.endpoint, p256dh: row.p256dh, auth: row.auth });

export async function putSubscription(db: D1Database, device: Device, target: PushTarget, now: string): Promise<void> {
  await db
    .prepare('INSERT OR REPLACE INTO push_subscriptions (token_hash, house_id, slot, endpoint, p256dh, auth, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .bind(device.tokenHash, device.houseId, device.slot, target.endpoint, target.p256dh, target.auth, now)
    .run();
}

export async function deleteSubscription(db: D1Database, tokenHash: string): Promise<void> {
  await db.prepare('DELETE FROM push_subscriptions WHERE token_hash = ?').bind(tokenHash).run();
}

export async function subscriptionOf(db: D1Database, tokenHash: string): Promise<Subscription | null> {
  const row = await db.prepare('SELECT token_hash, endpoint, p256dh, auth FROM push_subscriptions WHERE token_hash = ?').bind(tokenHash).first<SubscriptionRow>();
  return row ? toSubscription(row) : null;
}

export async function subscriptionsFor(db: D1Database, houseId: string, slot: Slot): Promise<Subscription[]> {
  const { results } = await db
    .prepare('SELECT token_hash, endpoint, p256dh, auth FROM push_subscriptions WHERE house_id = ? AND slot = ?')
    .bind(houseId, slot)
    .all<SubscriptionRow>();
  return results.map(toSubscription);
}
