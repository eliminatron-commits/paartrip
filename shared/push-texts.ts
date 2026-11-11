// Texte der Mitteilungen. Der Server setzt sie in die Push-Nachricht, damit auch ein älterer
// Service Worker jede Art anzeigen kann.
import type { PushKind, PushPayload } from './api.ts';

/** `partner` ist der Vorname des Spielers, der die Mitteilung ausgelöst hat. */
export function pushPayload(kind: PushKind, partner: string): PushPayload {
  switch (kind) {
    case 'partner_done':
      return { kind, title: 'Your turn', body: `${partner} did their part. Now it's up to you.` };
    case 'new_task':
      return { kind, title: 'New task', body: 'A new little task is waiting for the two of you.' };
    case 'coupon_unlocked':
      return { kind, title: 'A gift for you', body: 'Something has been unveiled at home. Take a look.' };
    case 'redeem_requested':
      return { kind, title: 'Time to deliver', body: `${partner} would like to redeem a gift.` };
    case 'test':
      return { kind, title: 'It works', body: 'Notifications reach this phone.' };
  }
}
