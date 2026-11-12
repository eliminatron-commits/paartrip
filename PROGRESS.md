# PROGRESS – Nhà Mình – PaarTrip

Wiedereinstieg: diese Datei, `tests.json`, `git log`. Regeln und Architektur: `CLAUDE.md`.

## Stand

- **Phase 1/6 – Fundament:** abgeschlossen am 2026-11-11, alle Akzeptanzpunkte P1-01 bis P1-08 erfüllt. Live unter `https://eliminatron-commits.github.io/paartrip/` (Repo `eliminatron-commits/paartrip`, öffentlich, Pages über GitHub Actions). Der Update-Ablauf ist auch live über einen echten zweiten Deploy belegt.
- **Phase 2/6 – Abgleich und Push:** abgeschlossen am 2026-11-12, P2-01 bis P2-10 erfüllt, live seit Commit `a45b30d`. P2-11 (Push-Mitteilung auf dem iPhone) prüft der Nutzer.
- **Nächste Phase:** 3/6 – Haus und Gutscheine | Sonnet 5.5 (hoch). Der Nutzer fügt dafür den Projekt-Prompt wieder ein (er liegt nicht im Repo).
- **Auf beiden iPhones installiert** (vom Nutzer gemeldet am 2026-11-11, Stand Phase 1). Seitdem erreicht jeder Push auf `main` zwei echte Geräte. Der Update-Ablauf nach einem echten Deploy (`7027c8e` → `50fb2a7`) hat laut Nutzer auf beiden iPhones funktioniert. Noch nicht auf dem Gerät bestätigt: Darstellung unter Uhr und Dynamic Island.
- Phase 1 lief auf Fable 5.2 statt Opus 5.5. Ein Review durch `pruefer` fand nicht statt, weil die Subagenten erst nach dem Neustart geladen sind.
- Commits tragen die anonyme GitHub-Adresse (lokale Git-Einstellung dieses Repos), damit die private E-Mail-Adresse nicht im öffentlichen Repo steht.

## Phase 3/6 – Haus und Gutscheine: in Arbeit (Stand 2026-11-12, unterbrochen am Nutzungslimit)

Läuft auf Fable 5.2 statt Sonnet 5.5. Subagenten bisher: `builder` (Sonnet 5.5) für `src/lib/sound.ts`, `fliessband` (Haiku 5.5) für 18 Platzhalter-Stücke und 5 Platzhalter-Szenen.

**Gebaut und belegt** (Typecheck grün, 183 Vitest-Tests; Playwright: 26 Tests grün im letzten vollen Lauf plus `screens.spec.ts` und `settings.spec.ts` danach einzeln grün):
- Regeln in `shared/rules.ts`: `completeTask` (Bauzug, Meilenstein, Freischalten), `build.choose`, `build.place`, `piece.move`, `milestone.seen`, Einlösen. Test-Aufgaben über `test.completeTask`, nur wenn der Worker `TEST_ACTIONS=1` hat (lokal an; entfällt mit Phase 4).
- Inhalte: drei Räume mit 34 Plätzen (wall 8, surface 9, floor 6, ground 8, fence 3), Platz mit `size`, Raum mit `outdoor`.
- Oberfläche: Navigation (`TopBar`, `TabBar`, `SyncNotice`), `src/screens/` (home, today, gifts, milestone, settings), Ton, Einstellungen.
- Startbilder: `scripts/splash-sizes.ts`, `scripts/gen-assets.ts`, Verweise über `vite.config.ts`; Build geprüft (13 Bilder, nicht im Precache).

**Noch offen in dieser Phase:**
1. `e2e/install.spec.ts` für P3-08 schreiben (Startbild je Größe im richtigen Pixelmaß; Precache enthält Hülle, Schriften, Inhalte, keine Startbilder).
2. Voller Lauf `npm run test:e2e` nach den letzten Änderungen (Safe-Area-Boden, Startbilder).
3. Entscheiden und mit dem Nutzer klären: `TEST_ACTIONS` in `worker/wrangler.jsonc` für die echten iPhones einschalten (dann ist der Bauzug dort ausprobierbar) oder nicht.
4. Review durch `pruefer`, Befunde beheben.
5. `CLAUDE.md` (Ordner `screens/`, Platz-Schema, Test-Aktionen, Setzungen), `tests.json` (P3-01 bis P3-09), Commit "Phase 3: Haus und Gutscheine".
6. Setzungen festhalten: Dekostück stellt auf, wer zuerst kommt (`piece.move`); nach dem letzten Meilenstein ist das Hinterlegen geschlossen; Push `partner_done` beim Wählen im Bauzug.
7. P2-11 (Probe-Mitteilung auf dem iPhone) ist weiter unbestätigt – der Nutzer hat nur das Update auf `a45b30d` bestätigt.

## Phase 2/6 – Abgleich und Push: abgeschlossen am 2026-11-12

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

**Abnahme am 2026-11-12:**
- Push auf `main` mit Zustimmung des Nutzers; Workflow-Lauf 43174145516 grün: Build mit allen Tests (die Worker-Tests liefen dabei erstmals unter Linux), Job `worker` (keine neue Migration, Worker veröffentlicht), Job `deploy` (Pages). Die Repo-Secrets `CLOUDFLARE_API_TOKEN` (Token `paartrip-github`: Workers Scripts Write, D1 Write, Account Settings Read) und `CLOUDFLARE_ACCOUNT_ID` hat der Nutzer angelegt.
- P2-07: In WebKit von der Live-Adresse aus (Versionszeile `a45b30d`) haben sich zwei Geräte gekoppelt; eine Aktion von A kam bei B an, der Text blieb verborgen. Anfragen an den veröffentlichten Worker: `POST /houses` 201, `POST /houses/join` 201, `POST /sync` 200.
- P2-08: Suche über die gesamte Git-Historie nach privaten Schlüsseln, Tokens, Konto-ID und E-Mail-Adresse ohne Treffer. Das Worker-Secret `VAPID_PRIVATE_KEY` ist nach dem Deploy aus dem Workflow weiter gesetzt.

**Offen:**
1. P2-11: Der Nutzer prüft die Push-Mitteilung auf dem iPhone (App vom Home-Bildschirm öffnen, koppeln, "Turn on notifications", dann die Probe-Mitteilung).
2. In der echten Datenbank liegt ein Probehaus aus der Abnahme ("Probe A & Probe B"); was der Nutzer zum Testen anlegt, ist ebenfalls ein Probestand (Obergrenze 20 Häuser). Vor dem echten Start die Datenbank mit Zustimmung des Nutzers leeren – oder ab dann jede Änderung am gespeicherten `HouseState` als Umstellung mitliefern. "Start over" sorgt dafür, dass die Telefone nach dem Leeren nicht festhängen.
3. Dieser Abschluss-Commit (nur Doku) ist lokal und geht mit dem nächsten Push hinaus – ein eigener Push würde auf beiden iPhones nur einen weiteren Update-Hinweis auslösen.

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
