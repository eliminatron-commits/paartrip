// Push-Auslöser. Spätere Phasen rufen nichts davon direkt auf: Eine Regel in shared/rules.ts gibt
// PushEffect-Einträge zurück ("wer bekommt worüber eine Mitteilung"), und der Abgleich reicht sie nach
// dem Speichern an `deliver` weiter. `notify` verschickt eine fertige Mitteilung an einen Spieler.
import type { PushPayload } from '../../shared/api.ts';
import { type HouseState, otherSlot, type Slot } from '../../shared/model.ts';
import { pushPayload } from '../../shared/push-texts.ts';
import type { PushEffect } from '../../shared/rules.ts';
import type { Env } from './index.ts';
import { deleteSubscription, type Subscription, subscriptionsFor } from './store.ts';
import { sendPush, type VapidKeys } from './webpush.ts';

/** VAPID-Schlüssel aus der Umgebung; null, solange der Server keine hat. */
export function pushKeys(env: Env): VapidKeys | null {
  if (!env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY) return null;
  return { publicKey: env.VAPID_PUBLIC_KEY, privateKey: env.VAPID_PRIVATE_KEY, subject: env.VAPID_SUBJECT };
}

async function sendTo(env: Env, keys: VapidKeys, subscription: Subscription, payload: PushPayload): Promise<void> {
  try {
    // Abgemeldete Geräte meldet der Push-Dienst zurück; ihre Anmeldung wird entfernt.
    if ((await sendPush(subscription, payload, keys)) === 'gone') await deleteSubscription(env.DB, subscription.tokenHash);
  } catch (error) {
    // Eine verlorene Mitteilung darf den Abgleich nie stören.
    console.error('Push fehlgeschlagen', error);
  }
}

/** Schickt eine Mitteilung an das Gerät eines Spielers – falls es Push eingeschaltet hat. */
export async function notify(env: Env, houseId: string, to: Slot, payload: PushPayload): Promise<void> {
  const keys = pushKeys(env);
  if (!keys) return;
  for (const subscription of await subscriptionsFor(env.DB, houseId, to)) await sendTo(env, keys, subscription, payload);
}

/** Verschickt die Mitteilungen, die beim Anwenden von Aktionen entstanden sind. */
export async function deliver(env: Env, state: HouseState, effects: PushEffect[]): Promise<void> {
  for (const effect of effects) {
    const partner = state.players[otherSlot(effect.to)]?.name ?? '';
    await notify(env, state.id, effect.to, pushPayload(effect.kind, partner));
  }
}

/** Probe-Mitteilung an genau dieses Gerät, mit kurzer Wartezeit zum Schließen der App. */
export async function sendTest(env: Env, subscription: Subscription): Promise<void> {
  const keys = pushKeys(env);
  if (!keys) return;
  const delay = Number(env.PUSH_TEST_DELAY_MS) || 0;
  if (delay > 0) await new Promise((done) => setTimeout(done, delay));
  await sendTo(env, keys, subscription, pushPayload('test', ''));
}
