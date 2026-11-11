/// <reference lib="webworker" />
// Eigener Service Worker (injectManifest): Precache der App-Shell und Update von Hand.
import { cleanupOutdatedCaches, precacheAndRoute } from 'workbox-precaching';

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
