# PROGRESS – Nhà Mình – PaarTrip

Wiedereinstieg: diese Datei, `tests.json`, `git log`. Regeln und Architektur: `CLAUDE.md`.

## Stand

- **Phase 1/6 – Fundament:** abgeschlossen am 2026-11-11, alle Akzeptanzpunkte P1-01 bis P1-08 erfüllt. Live unter `https://eliminatron-commits.github.io/paartrip/` (Repo `eliminatron-commits/paartrip`, öffentlich, Pages über GitHub Actions). Der Update-Ablauf ist auch live über einen echten zweiten Deploy belegt.
- **Laufende Phase:** 2/6 – Abgleich und Push, in der Abnahme (siehe unten). Danach 3/6 – Haus und Gutscheine | Sonnet 5.5 (hoch); der Nutzer fügt dafür den Projekt-Prompt wieder ein.
- **Auf beiden iPhones installiert** (vom Nutzer gemeldet am 2026-11-11, Stand Phase 1). Seitdem erreicht jeder Push auf `main` zwei echte Geräte. Der Update-Ablauf nach einem echten Deploy (`7027c8e` → `50fb2a7`) hat laut Nutzer auf beiden iPhones funktioniert. Noch nicht auf dem Gerät bestätigt: Darstellung unter Uhr und Dynamic Island.
- Phase 1 lief auf Fable 5.2 statt Opus 5.5. Ein Review durch `pruefer` fand nicht statt, weil die Subagenten erst nach dem Neustart geladen sind.
- Commits tragen die anonyme GitHub-Adresse (lokale Git-Einstellung dieses Repos), damit die private E-Mail-Adresse nicht im öffentlichen Repo steht.

## Phase 2/6 – Abgleich und Push: Stand vom 2026-11-12 (Worker veröffentlicht, App noch nicht gepusht)

Gebaut am 2026-11-11 auf Fable 5.2 ohne Subagenten (sie waren nicht geladen), eingerichtet am 2026-11-12, ebenfalls auf Fable 5.2. Das Review durch `pruefer` (Opus 5.5) lief am 2026-11-12.

**Gebaut und lokal belegt** (Typecheck grün, 93 Vitest-Tests, 13 Playwright-Tests in WebKit):
- Worker `worker/` (Cloudflare, D1): Koppeln per Code, Token-Prüfung, Abgleich mit Schutz vor doppelten Aktionen und gleichzeitigem Schreiben, CORS nur für die App-Adresse, Obergrenze an Häusern, Web Push mit VAPID samt Probe-Mitteilung. Tests in `worker/test/` laufen gegen den echten Worker in lokalem workerd (`createTestHarness` aus wrangler).
- Regeln und gefilterte Sicht: `shared/rules.ts`, `shared/view.ts`, `shared/wire.ts` (Prüfung der Anfragen), `shared/limits.ts`, `shared/time.ts`, `shared/push-texts.ts`. Von den Aktionen ist bisher nur `coupon.deposit` umgesetzt; alle anderen lehnt der Server ab, bis Phase 3 und 4 ihre Regeln bringen.
- App: lokale Kopie in IndexedDB (`src/lib/store.ts`), Abgleich mit Warteschlange (`src/lib/sync-engine.ts`, `session.svelte.ts`), Export/Import (`device-file.ts`), Push (`push.svelte.ts`, Empfang in `src/sw.ts`), Oberfläche in `src/components/` (Pairing, HouseStatus, SecretGifts, DeviceSettings, RestoreBackup). Der Abschnitt "Secret gifts" ist vorläufig und dient als echter Träger für den Abgleich.
- Zwei-Geräte-Tests `e2e/sync.spec.ts` gegen den lokalen Worker (`e2e/api-server.ts`, Port 8788).
- Cloudflare-Gratis-Grenzen geprüft (Doku, Stand 2026-10-29): Workers 100.000 Anfragen/Tag, 10 ms CPU je Anfrage, 50 Unteranfragen, 5 Cron-Trigger; D1 10 Datenbanken, 500 MB je Datenbank, 5 Mio. gelesene und 100.000 geschriebene Zeilen/Tag, 50 Abfragen je Aufruf. Bei Überschreitung Fehler, keine Kosten.
- **Fehler aus Phase 1 behoben:** Nach der Erstinstallation erschien fälschlich "New version – Update" (gemessen: 37 von 40 frischen Installationen, nach der Korrektur 0 von 40). Ursache und Korrektur: `updateIsWaiting` in `src/lib/update-logic.ts`. Der neue Test in `e2e/update.spec.ts` erwischt den alten Fehler im Testlauf nicht zuverlässig (mit Aufzeichnung tritt er seltener auf) – belegt ist die Korrektur durch die Messung und die Vitest-Tests.
- Sichtprüfung der neuen Bildschirme im Querformat (956×440, Safe Area seitlich 59 px): nichts läuft über. `npm audit` nach der Installation von wrangler unverändert (7 Hinweise in Build-Werkzeugen).

**Bei Cloudflare eingerichtet (2026-11-12, mit Zustimmung des Nutzers, Gratis-Tarif):**
- Konto des Nutzers; wrangler ist auf diesem PC angemeldet (`npx wrangler whoami`). Im Konto liegt eine weitere Datenbank aus einem anderen Projekt – nicht anfassen.
- D1-Datenbank `paartrip` (Westeuropa), Migration `0001_init.sql` angewendet; id in `worker/wrangler.jsonc`.
- Worker `paartrip-api` unter `https://paartrip-api.alex-rettig.workers.dev` (steht als `VITE_API_URL` in `.env.production`).
- VAPID: öffentlicher Schlüssel in `worker/wrangler.jsonc`, privater nur als Worker-Secret `VAPID_PRIVATE_KEY`. Er wurde im Speicher erzeugt und direkt übergeben, es gibt keine Kopie. Geht er verloren: neues Paar erzeugen, öffentlichen Schlüssel ersetzen, beide Geräte melden Push neu an.
- Lesende Proben gegen den veröffentlichten Worker: `GET /` antwortet, falscher Code → `invalid_code`, erfundener Token → `unauthorized` (beides liest D1), ohne oder mit fremdem `Origin` → 403 ohne CORS-Kopfzeilen, Preflight von der App-Adresse → 204.
- Workflow `.github/workflows/deploy.yml`: neuer Job `worker` (Migrationen, Deploy) zwischen Build und Pages.

**Review durch `pruefer` (Opus 5.5) am 2026-11-12:** nichts Kritisches; Verborgenes, Zugriff, Schutz vor Doppeltem auf dem Server, Web Push und Secrets ohne Befund. Behoben, jeweils mit Test (jetzt 99 Vitest-, 14 Playwright-Tests):
- Import einer Sicherung, während ein Abgleich beginnt: Aktionen der neuen Rolle gingen mit dem alten Token hinaus. Jetzt sperrt `switchDevice` den Abgleich während des Wechsels (`src/lib/sync-engine.ts`).
- Ein Gerät, das der Server nicht mehr kennt, hing fest. Jetzt bietet `HouseStatus` nach Rückfrage "Start over" an (`SyncEngine.reset`).
- Workflow: Nur noch der Job `deploy` darf auf Pages veröffentlichen; der Build hat keine Deploy-Rechte mehr.
- Sicht: auch erledigte Aufgaben und Abgaben werden Feld für Feld aufgebaut (`shared/view.ts`).
- Import und Neuanfang lösen die Push-Anmeldung der bisherigen Rolle (`push.svelte.ts`) – im Test nicht prüfbar, weil WebKit in Playwright kein Push kennt.
- Eine Sicherung mit einer nicht mehr gültigen wartenden Aktion wird jetzt übernommen; die Aktion fällt weg und wird gemeldet. Das ist eine bewusste Änderung: Der frühere Test verlangte, dass eine solche Datei abgelehnt wird.
- Scheitert eine Regel an einer Aktion, gilt die Aktion als abgelehnt, statt jeden weiteren Abgleich mit einem Serverfehler zu blockieren (`applyAction` in `shared/rules.ts`).
- Nicht geändert, aber in `CLAUDE.md` festgehalten: Der Schutz hängt am Token, nicht an der Origin-Prüfung; `MAX_HOUSES` ist nur eine Bremse.

**Offen in Phase 2:**
1. Nutzer: Cloudflare-API-Token `paartrip-github` (Workers Scripts Write, D1 Write, Account Settings Read) als Repo-Secret `CLOUDFLARE_API_TOKEN` eintragen, dazu `CLOUDFLARE_ACCOUNT_ID`. Ohne sie schlägt der Job `worker` fehl und es wird nichts veröffentlicht.
2. Push auf `main` erst nach Rückfrage. Im Workflow laufen dann erstmals die Worker-Tests (workerd unter Linux) – den ersten Lauf beobachten.
3. Abnahme P2-07 (Abgleich von der Live-Adresse) nach dem Push; P2-11 (Push auf dem iPhone) prüft der Nutzer mit "Send a test notification".
4. Häuser, die bis zum echten Start angelegt werden, sind Probehäuser (Obergrenze 20). Vor dem echten Start die Datenbank mit Zustimmung des Nutzers leeren – oder ab dann jede Änderung am gespeicherten `HouseState` als Umstellung mitliefern.

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
