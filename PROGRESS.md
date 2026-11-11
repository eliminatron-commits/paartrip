# PROGRESS – Nhà Mình – PaarTrip

Wiedereinstieg: diese Datei, `tests.json`, `git log`. Regeln und Architektur: `CLAUDE.md`.

## Stand

- **Phase 1/6 – Fundament:** abgeschlossen am 2026-11-11, alle Akzeptanzpunkte P1-01 bis P1-08 erfüllt. Live unter `https://eliminatron-commits.github.io/paartrip/` (Repo `eliminatron-commits/paartrip`, öffentlich, Pages über GitHub Actions). Der Update-Ablauf ist auch live über einen echten zweiten Deploy belegt.
- **Nächste Phase:** 2/6 – Abgleich und Push | Opus 5.5 (hoch). Neue Sitzung starten, damit die Subagenten aus `.claude/agents/` geladen werden.
- **Auf beiden iPhones installiert** (vom Nutzer gemeldet am 2026-11-11, Stand Phase 1). Seitdem erreicht jeder Push auf `main` zwei echte Geräte. Der Update-Ablauf nach einem echten Deploy (`7027c8e` → `50fb2a7`) hat laut Nutzer auf beiden iPhones funktioniert. Noch nicht auf dem Gerät bestätigt: Darstellung unter Uhr und Dynamic Island.
- Phase 1 lief auf Fable 5.2 statt Opus 5.5. Ein Review durch `pruefer` fand nicht statt, weil die Subagenten erst nach dem Neustart geladen sind.
- Commits tragen die anonyme GitHub-Adresse (lokale Git-Einstellung dieses Repos), damit die private E-Mail-Adresse nicht im öffentlichen Repo steht.

## Phase 2/6 – Abgleich und Push: Zwischenstand vom 2026-11-11 (noch nicht abgenommen, nichts gepusht)

Lief in der alten Sitzung auf Fable 5.2 und ohne Subagenten (sie waren nicht geladen; der Nutzer schrieb nach dem Hinweis "weiter"). Abgebrochen am Nutzungslimit.

**Fertig und lokal belegt** (Typecheck grün, 93 Vitest-Tests, 13 Playwright-Tests in WebKit):
- Worker `worker/` (Cloudflare, D1): Koppeln per Code, Token-Prüfung, Abgleich mit Schutz vor doppelten Aktionen und gleichzeitigem Schreiben, CORS nur für die App-Adresse, Obergrenze an Häusern, Web Push mit VAPID samt Probe-Mitteilung. Tests in `worker/test/` laufen gegen den echten Worker in lokalem workerd (`createTestHarness` aus wrangler).
- Regeln und gefilterte Sicht: `shared/rules.ts`, `shared/view.ts`, `shared/wire.ts` (Prüfung der Anfragen), `shared/limits.ts`, `shared/time.ts`, `shared/push-texts.ts`. Von den Aktionen ist bisher nur `coupon.deposit` umgesetzt; alle anderen lehnt der Server ab, bis Phase 3 und 4 ihre Regeln bringen.
- App: lokale Kopie in IndexedDB (`src/lib/store.ts`), Abgleich mit Warteschlange (`src/lib/sync-engine.ts`, `session.svelte.ts`), Export/Import (`device-file.ts`), Push (`push.svelte.ts`, Empfang in `src/sw.ts`), Oberfläche in `src/components/` (Pairing, HouseStatus, SecretGifts, DeviceSettings, RestoreBackup).
- Zwei-Geräte-Tests `e2e/sync.spec.ts` gegen den lokalen Worker (`e2e/api-server.ts`, Port 8788).
- Cloudflare-Gratis-Grenzen geprüft (Doku, Stand 2026-10-29): Workers 100.000 Anfragen/Tag, 10 ms CPU je Anfrage, 50 Unteranfragen, 5 Cron-Trigger; D1 10 Datenbanken, 500 MB je Datenbank, 5 Mio. gelesene und 100.000 geschriebene Zeilen/Tag, 50 Abfragen je Aufruf. Bei Überschreitung Fehler, keine Kosten.
- **Fehler aus Phase 1 behoben:** Nach der Erstinstallation erschien fälschlich "New version – Update" (gemessen: 37 von 40 frischen Installationen, nach der Korrektur 0 von 40). Ursache und Korrektur: `updateIsWaiting` in `src/lib/update-logic.ts`. Der neue Test in `e2e/update.spec.ts` erwischt den alten Fehler im Testlauf nicht zuverlässig (mit Aufzeichnung tritt er seltener auf) – belegt ist die Korrektur durch die Messung und die Vitest-Tests.

**Offen in Phase 2:**
1. Cloudflare mit dem Nutzer einrichten (Klick für Klick): Konto, `npx wrangler login`, `wrangler d1 create paartrip` und die id in `worker/wrangler.jsonc` eintragen, VAPID-Schlüssel erzeugen (öffentlichen in `wrangler.jsonc`, privaten per `wrangler secret put VAPID_PRIVATE_KEY`), Migration und erster Deploy.
2. Adresse des Workers in `.env.production` als `VITE_API_URL` eintragen. Ohne sie bricht `npm run build` absichtlich ab – deshalb vorher nicht pushen.
3. `.github/workflows/deploy.yml` um Migration und Worker-Deploy erweitern; Repo-Secrets `CLOUDFLARE_API_TOKEN` und `CLOUDFLARE_ACCOUNT_ID` legt der Nutzer an.
4. Abnahme: P2-07 (Live-Abgleich), P2-08 (Suche nach Secrets in Repo und Historie), P2-11 (Push auf dem iPhone, Nutzer); `tests.json` aktualisieren (P2-01 bis P2-06, P2-09, P2-10 sind lokal belegt, aber dort noch nicht eingetragen); `CLAUDE.md` um Worker, Befehle (`npm run dev:api`) und die zweite Inhaltsdatei `generated/content-rules.json` ergänzen; Commit "Phase 2: Abgleich und Push"; Push erst nach Rückfrage.
5. Noch nicht geprüft: Sichtprüfung der neuen Bildschirme im Querformat; `npm audit` nach der Installation von wrangler.

## Was steht

- Gerüst: Svelte 5, Vite 8, TypeScript 6, vite-plugin-pwa 2 (`injectManifest`), eigener Service Worker `src/sw.ts`.
- Update-Funktion vollständig, per Playwright in WebKit mit nachgestelltem zweitem Deploy belegt (`e2e/update.spec.ts`).
- Datenmodell und Schnittstelle als Typen: `shared/model.ts`, `shared/actions.ts`, `shared/api.ts`.
- Inhalts-Pipeline: `shared/content-schema.ts` + `scripts/build-content.ts` → `generated/content.json`; je ein Beispieleintrag pro Typ unter `content/chapter-1/` (Platzhalter bis Phase 5). Die drei festen Gutscheine und die Meilensteine 5–30 stehen schon mit ihren echten Werten drin.
- Workflow `.github/workflows/deploy.yml`, fünf Subagenten, `CLAUDE.md`, `tests.json`.

## Offene Punkte für spätere Phasen

- **Tagesregel (Phase 4, vom Nutzer bestätigen lassen):** "frühestens am folgenden Kalendertag" ist im Modell als "höchstens eine neue Aufgabe pro Kalendertag" angelegt (`ActiveTask.availableOn`). Wer montags eine Aufgabe bekommt und sie mittwochs erledigt, bekäme die nächste sofort am Mittwoch, die übernächste frühestens Donnerstag. Die strengere Lesart (immer erst am Tag nach dem Erledigen) wäre mit denselben Feldern möglich.
- **Rätseldaten (Phase 4):** Nur `split-code` hat ein Datenschema, und das ist vorläufig. Die übrigen fünf Arten in `shared/content-schema.ts` bei `puzzleTask` ergänzen.
- **Kennst-du-mich mit Freitext (Phase 4):** Wer entscheidet über den Treffer? Vorschlag: Wer die Antwort gegeben hat, bestätigt das Herz.
- **Dekostück im Meilenstein-Geschenk (Phase 3):** Wie kommt es ins Haus – eigener Bauzug oder fester Platz? `ReachedMilestone.decoPiece` trägt bisher nur die id.
- **Geheime Gutscheine nach Meilenstein 30 (Phase 3):** Es gibt dann keinen "nächsten" Meilenstein in Kapitel 1.
- **Push "neue Aufgabe verfügbar" (Phase 2/4):** Die nächste Aufgabe erscheint am Tageswechsel, ohne dass jemand die App öffnet. Dafür braucht der Worker einen Cron-Trigger; vorher Gratis-Grenzen prüfen.
- **Vietnamesische Begriffe** in `content/vi-terms.json` sind ungeprüft, bis die Frau des Nutzers die Liste gesehen hat.
- `npm audit` meldet 7 Hinweise (niedrig/mittel) in Build-Werkzeugen (glob, minimatch, deepmerge unter workbox-build). Sie laufen nur beim Bauen und stecken nicht in der App; `npm audit fix --force` würde Pakete auf alte Hauptversionen zurücksetzen und bleibt deshalb aus.

## Ideen außerhalb des Umfangs

- Abendpalette (Indigo, Laternengelb) als zweites Farbschema.
- Kursive Fraunces für die vietnamesischen Zweitnamen (bräuchte die Kursiv-Schriftdateien im Precache).
