// Mitteilungen (Web Push) auf diesem Gerät ein- und ausschalten. Auf dem iPhone gibt es Push nur für
// Apps auf dem Home-Bildschirm (ab iOS 16.4), und die Erlaubnis darf nur aus einer Nutzergeste erfragt werden.
import { ApiFailure } from './api.ts';
import { deviceToken, onRoleEnded, session, transport, updateSettings } from './session.svelte.ts';

export const push = $state<{ supported: boolean; busy: boolean; message: string }>({ supported: false, busy: false, message: '' });

function bytes(base64url: string): Uint8Array<ArrayBuffer> {
  const binary = atob(base64url.replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

function sameKey(current: ArrayBuffer | null | undefined, wanted: Uint8Array): boolean {
  if (!current) return false;
  const have = new Uint8Array(current);
  return have.length === wanted.length && have.every((byte, i) => byte === wanted[i]);
}

function token(): string {
  const value = deviceToken();
  if (!value) throw new Error('Gerät ist nicht gekoppelt');
  return value;
}

/** Meldet dieses Gerät beim Push-Dienst an (oder übernimmt die bestehende Anmeldung) und gibt sie dem Server. */
async function subscribe(): Promise<void> {
  const registration = await navigator.serviceWorker.ready;
  const key = bytes((await transport.pushKey(token())).publicKey);
  let subscription = await registration.pushManager.getSubscription();
  // Eine Anmeldung mit altem Server-Schlüssel wäre wertlos.
  if (subscription && !sameKey(subscription.options.applicationServerKey, key)) {
    await subscription.unsubscribe();
    subscription = null;
  }
  subscription ??= await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
  const { endpoint, keys } = subscription.toJSON();
  if (!endpoint || !keys?.p256dh || !keys.auth) throw new Error('unvollständige Push-Anmeldung');
  await transport.pushSubscribe(token(), { endpoint, keys: { p256dh: keys.p256dh, auth: keys.auth } });
}

function explain(error: unknown): string {
  if (error instanceof ApiFailure && error.code === 'offline') return "No connection. Try again when you're online.";
  if (error instanceof ApiFailure && error.code === 'push_unavailable') return "Notifications aren't set up on the server yet.";
  console.error(error);
  return "That didn't work. Please try again.";
}

/**
 * Die bisherige Rolle dieses Geräts gibt es hier nicht mehr (Import, Neuanfang). Ihre Anmeldung beim
 * Push-Dienst und beim Server wird gelöst – sonst kämen weiter Mitteilungen für sie an, obwohl die
 * Einstellung "aus" zeigt.
 */
async function forgetSubscription(previousToken: string): Promise<void> {
  push.message = '';
  if (!push.supported) return;
  const registration = await navigator.serviceWorker.ready;
  await (await registration.pushManager.getSubscription())?.unsubscribe();
  await transport.pushUnsubscribe(previousToken).catch(() => undefined);
}

export function initPush(): void {
  // Ohne Service Worker (Dev-Server) und ohne Push-Schnittstelle (iPhone-Safari außerhalb des Home-Bildschirms) geht nichts.
  push.supported = import.meta.env.PROD && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
  onRoleEnded(forgetSubscription);
  // Push-Dienste tauschen Anmeldungen gelegentlich aus: beim Start still auffrischen.
  if (push.supported && session.settings.push && Notification.permission === 'granted') {
    void subscribe().catch((error: unknown) => console.error(error));
  }
}

/** Aus einem Tippen aufrufen. Die Erlaubnis wird als Erstes erfragt, vor jedem anderen Warten. */
export async function enablePush(): Promise<void> {
  push.busy = true;
  push.message = '';
  try {
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      push.message = 'Notifications are blocked for this app. You can allow them in the iPhone Settings under Notifications.';
      return;
    }
    await subscribe();
    await updateSettings({ push: true });
    push.message = 'Notifications are on.';
  } catch (error) {
    push.message = explain(error);
  } finally {
    push.busy = false;
  }
}

export async function disablePush(): Promise<void> {
  push.busy = true;
  push.message = '';
  try {
    // Die Einstellung gilt sofort; das Abmelden beim Server darf an fehlendem Netz nicht scheitern.
    await updateSettings({ push: false });
    const registration = await navigator.serviceWorker.ready;
    await (await registration.pushManager.getSubscription())?.unsubscribe();
    await transport.pushUnsubscribe(token()).catch(() => undefined);
    push.message = 'Notifications are off.';
  } catch (error) {
    push.message = explain(error);
  } finally {
    push.busy = false;
  }
}

export async function sendTestPush(): Promise<void> {
  push.busy = true;
  push.message = '';
  try {
    await transport.pushTest(token());
    push.message = 'On its way. Lock your phone or leave the app – it arrives in a few seconds.';
  } catch (error) {
    push.message = error instanceof ApiFailure && error.code === 'no_subscription' ? 'Please turn notifications off and on again.' : explain(error);
  } finally {
    push.busy = false;
  }
}
