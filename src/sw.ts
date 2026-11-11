/// <reference lib="webworker" />
// Eigener Service Worker (injectManifest): Precache der App-Shell, Update von Hand, Empfang von Push.
import { cleanupOutdatedCaches, precacheAndRoute } from 'workbox-precaching';
import type { PushPayload } from '../shared/api.ts';

declare let self: ServiceWorkerGlobalScope;

cleanupOutdatedCaches();
precacheAndRoute(self.__WB_MANIFEST);

// Erstinstallation: die offene Seite sofort übernehmen, damit Update-Ablauf und Offline-Start
// ab dem ersten Öffnen einheitlich funktionieren.
self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

// Eine neue Version wartet, bis der Nutzer "Update" tippt – nie mitten in der Nutzung übernehmen.
self.addEventListener('message', (event) => {
  if ((event.data as { type?: string } | null)?.type === 'SKIP_WAITING') void self.skipWaiting();
});

// Push: Der Server schickt Titel und Text fertig mit. Jede Nachricht muss als Mitteilung erscheinen –
// iOS entzieht einer App die Push-Erlaubnis, wenn sie Nachrichten still verschluckt.
self.addEventListener('push', (event) => {
  let payload: Partial<PushPayload> = {};
  try {
    payload = (event.data?.json() ?? {}) as Partial<PushPayload>;
  } catch {
    // Unlesbare Nachricht: trotzdem eine allgemeine Mitteilung zeigen.
  }
  event.waitUntil(
    self.registration.showNotification(payload.title ?? 'Nhà Mình', {
      body: payload.body ?? 'Something new is waiting at home.',
      icon: `${self.registration.scope}icons/icon-192.png`,
      // Gleichartige Mitteilungen ersetzen einander, statt sich zu stapeln.
      tag: payload.kind ?? 'general',
    }),
  );
});

// Tippen auf die Mitteilung bringt die App nach vorn (oder öffnet sie).
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      const open = windows.find((client) => client.url.startsWith(self.registration.scope));
      if (open) await open.focus();
      else await self.clients.openWindow(self.registration.scope);
    })(),
  );
});
