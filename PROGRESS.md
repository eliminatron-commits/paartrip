# PROGRESS – Nhà Mình – PaarTrip

Wiedereinstieg: diese Datei, `tests.json`, `git log`. Regeln und Architektur: `CLAUDE.md`.

## Stand

- **Phase 1/6 – Fundament:** abgeschlossen am 2026-11-11, alle Akzeptanzpunkte P1-01 bis P1-08 erfüllt. Live unter `https://eliminatron-commits.github.io/paartrip/` (Repo `eliminatron-commits/paartrip`, öffentlich, Pages über GitHub Actions). Der Update-Ablauf ist auch live über einen echten zweiten Deploy belegt.
- **Nächste Phase:** 2/6 – Abgleich und Push | Opus 5.5 (hoch). Neue Sitzung starten, damit die Subagenten aus `.claude/agents/` geladen werden.
- Phase 1 lief auf Fable 5.2 statt Opus 5.5. Ein Review durch `pruefer` fand nicht statt, weil die Subagenten erst nach dem Neustart geladen sind.
- Commits tragen die anonyme GitHub-Adresse (lokale Git-Einstellung dieses Repos), damit die private E-Mail-Adresse nicht im öffentlichen Repo steht.

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
