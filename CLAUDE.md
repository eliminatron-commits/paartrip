# CLAUDE.md – Nhà Mình – PaarTrip

Privates Koop-Spiel für genau ein Paar (Alex und seine Frau), als iPhone-PWA ohne App Store. Beide richten gemeinsam ein Haus mit Garten ein; Baufortschritt entsteht nur durch Tagesaufgaben, die beide zusammen erledigen. Sechs Phasen; Stand und nächster Schritt stehen in `PROGRESS.md`, die Akzeptanztests aller Phasen in `tests.json`.

Live-Adresse: `https://eliminatron-commits.github.io/paartrip/` (GitHub Pages, Repo `eliminatron-commits/paartrip`).

## Befehle

Node 24 liegt auf diesem Rechner nicht im PATH. Vor jedem Befehl:
PowerShell `$env:Path = "C:\Program Files\nodejs;" + $env:Path` · Bash `export PATH="/c/Program Files/nodejs:$PATH"`

| Befehl | Zweck |
| --- | --- |
| `npm run dev` | Dev-Server (ohne Service Worker) |
| `npm run typecheck` | svelte-check für `src/` + `shared/`, tsc für Skripte, Tests und Konfiguration |
| `npm test` | Vitest (Logik) |
| `npm run test:e2e` | baut zwei Versionen nach `dist-e2e/`, dann Playwright in WebKit bei 440×956 |
| `npm run build` | Produktions-Build nach `dist/` |
| `npm run content` | prüft `content/` gegen das Schema und baut `generated/content.json` |

Einzelner Test: `npx vitest run shared/content-schema.test.ts` bzw. `npx playwright test e2e/update.spec.ts` (vorher einmal `npm run test:e2e`, damit `dist-e2e/` existiert).

Eine Änderung gilt erst als erledigt, wenn ein echter Check sie belegt (Typecheck, Tests, Build oder der geänderte Befehl selbst).

## Ordnerstruktur

```
content/            Inhalte als Datendateien, getrennt vom Code
  vi-terms.json       alle vietnamesischen Begriffe (Begriff, Bedeutung, Fundstelle)
  chapter-N/          chapter.json, coupons.json, tasks/, story/, rooms/, pieces/
shared/             von App und Worker gemeinsam genutzt, ohne DOM- oder Worker-APIs
  content-schema.ts   Zod-Schema der Inhalte = einzige Quelle der Inhalts-Typen
  model.ts            HouseState (Server) und HouseView (Sicht eines Spielers)
  actions.ts          Aktionen und ihre Ergebnisse
  api.ts              Routen, Anfragen, Antworten, Push-Nutzlast
src/                Svelte-App
  lib/                Logik ohne Oberfläche (*.svelte.ts nur, wenn Runen nötig sind)
  components/         wiederverwendbare Oberfläche
  screens/            ab Phase 3: ein Ordner je Bildschirm
  sw.ts               eigener Service Worker
worker/             ab Phase 2: Cloudflare Worker + D1
scripts/            Build-Helfer (Inhalte bündeln, Icons erzeugen)
e2e/                Playwright-Tests und Testserver
generated/          erzeugt, nicht im Repo (content.json)
public/icons/       erzeugt, nicht im Repo (PNG-Icons aus public/icon.svg)
```

## Architektur

- **Der Server ist die Quelle der Wahrheit.** Je Haus ein `HouseState`. Geräte erhalten ausschließlich die für sie gefilterte `HouseView` und speichern die letzte als lokale Kopie (IndexedDB), damit die App offline mit dem letzten Stand startet. Das Gerät verändert die Sicht nie selbst.
- **Jede Änderung ist eine Aktion** (`shared/actions.ts`) mit auf dem Gerät erzeugter id. Aktionen gehen in eine Warteschlange und werden beim Abgleich eingereicht; der Server wendet jede id höchstens einmal an (`applied` / `duplicate` / `rejected`). Auch eine abgelehnte Aktion verlässt die Warteschlange – kein Gerät darf festhängen.
- **Abgleich** beim Öffnen, bei Rückkehr in die App und nach jeder eigenen Aktion: `POST /sync` reicht Aktionen ein und liefert die neue Sicht.
- **Verborgenes bleibt auf dem Server:** Kennst-du-mich-Antworten vor beidseitiger Abgabe und der Text geheimer Gutscheine vor dem Freischalten stehen in keiner Antwort an das andere Gerät. Die Filterung geschieht an genau einer Stelle (Sicht aus dem Stand ableiten) und ist per Test belegt.
- **Spielregeln sind reine Funktionen in `shared/`** (Stand + Aktion + Inhalte + Serverzeit → neuer Stand), damit Vitest sie ohne Worker prüfen kann. Zeitregeln rechnen mit der Serverzeit und `DAY_TIMEZONE` (Europe/Berlin), nie mit der Gerätezeit.
- **Rollen:** Spieler `a` legt das Haus an, `b` tritt bei. Inhalte beziehen sich auf diese Slots (feste Gutscheine sind `from: a`, also legt Alex das Haus an).
- **Inhalte:** `scripts/build-content.ts` prüft jede Datei unter `content/` gegen `shared/content-schema.ts`, hängt `.svg`-Dateien als Inline-SVG an und schreibt `generated/content.json`. App und Worker lesen nur dieses Bündel. Neue Kapitel und Einträge brauchen keine Codeänderung; fehlerhafte Inhalte brechen Typecheck, Tests und Build ab. Setzungen (Meilenstein-Abstände, Zuordnung der festen Gutscheine, Parameter des Bauzugs) stehen in `content/chapter-N/` und sind dort änderbar.
- **Update-Funktion** (`src/lib/update.svelte.ts`, `src/sw.ts`): bei Rückkehr in die App `registration.update()`, höchstens einmal pro Minute; wartet ein neuer Worker, erscheint "New version – Update"; erst auf Tippen `skipWaiting`, bei `controllerchange` lädt die Seite neu. Versionszeile "Version · Build-Zeit · Commit" und Knopf "Check for updates" mit Ergebnis. Die Build-Zeit steckt im Bundle, damit jeder Deploy als neue Version erkannt wird.
- **Hosting:** GitHub Pages unter `/paartrip/`. `base` (Vite), `scope` und `start_url` (Manifest) kommen aus der einen Konstante `BASE` in `vite.config.ts`. Workflow bei Push auf `main`: Typecheck → Tests → Build → Deploy.

## Benennung

- Dateien: Svelte-Komponenten `PascalCase.svelte`, alles andere `kebab-case.ts`; Tests daneben als `*.test.ts` (Vitest) bzw. in `e2e/*.spec.ts` (Playwright).
- Relative Importe immer mit Dateiendung (`./model.ts`, `./Banner.svelte`). `shared/` und `scripts/` laufen auch direkt in Node, das die Endung verlangt.
- Inhalts-ids: `kebab-case`, gleich dem Dateinamen. Platz-ids beginnen mit der Raum-id (`kitchen-counter-1`).
- Aktionstypen `bereich.verb` (`build.place`), Routen in `shared/api.ts` → `ROUTES`.
- Tests heißen auf Deutsch, was sie belegen (`'ein dritter Beitritt wird abgelehnt'`). In der Oberfläche `data-testid` nur, wo Rolle und Text nicht reichen.

## Sprache

- Code-Kommentare und Kommunikation mit dem Nutzer: Deutsch. Alle Texte in der App: Englisch.
- Vietnamesisch als Würze: Zweitname (`nameVi`, `titleVi`) bei rund einem Viertel der Stücke, bei Gerichten und Kapiteltiteln, immer mit korrekten Diakritika. Jeder vietnamesische Begriff steht zusätzlich in `content/vi-terms.json`; die Bezugsprüfung meldet fehlende Einträge. Die Begriffe stammen von der KI und gelten als ungeprüft.
- Ton der Inhalte: warm, leicht, mit Humor. Nichts Kitschiges, zu Intimes oder Bloßstellendes. Deutschland und Vietnam sind Würze, nicht Thema.

## Verbotene Ansätze

- Kein Login, keine Konten, keine weiteren Paare, kein Chat, keine Echtzeit-Anzeige, keine Medien-Uploads, keine Analytics.
- Kein Stand nur im Speicher: jede Aktion sofort in IndexedDB sichern (iOS beendet Home-Bildschirm-Apps ohne Vorwarnung). Kein `localStorage` für Spielstand.
- Keine Spielregel, die sich auf die Gerätezeit verlässt. Kein Stand, der auf dem Gerät "optimistisch" umgeschrieben wird.
- Keine Serverantwort, die Verborgenes enthält und es dem Client zum Ausblenden überlässt.
- Kein automatisches Neuladen bei einem Update; kein `skipWaiting` ohne Tippen des Nutzers.
- Kein `<audio>`-Element und keine Audiodateien – Ton nur über WebAudio; AudioContext bei jeder Nutzergeste entsperren und nach Sperre oder App-Wechsel neu aufbauen.
- Keine externen Bild-, Schrift- oder Skriptquellen zur Laufzeit; keine Rasterbilder außer den erzeugten Icons und Startbildern.
- Keine Secrets im Repo (privater VAPID-Schlüssel, Cloudflare-Token nur als Worker- bzw. Repo-Secrets). Kein Bezahltarif bei Cloudflare.
- Keine Inhalte im Code: Aufgaben, Rätseldaten, Fragen, Story, Katalog, Gutscheine und Meilensteine gehören nach `content/`.
- Keine Mahnungen, Serien oder Verfall – Pausen haben keine Folgen.
- Tests nicht löschen oder abschwächen, um sie grün zu bekommen; keine hartcodierten Werte für Testfälle.
- Port 4190 und andere von Browsern gesperrte Ports nicht für Testserver verwenden (WebKit lädt dann nichts).

## Gestaltungsvorgaben

- Warme, flächige Vektorillustration, vollständig als SVG, keine Verläufe-Orgien, keine Konturlinien-Optik. Das Haus als Querschnitt (Puppenhaus), vertikal scrollbar, Plätze als Tippflächen.
- Palette als Tokens in `src/app.css`: Creme `--cream` als Grund, `--cream-deep` für Flächen, Terrakotta `--terracotta`, Salbeigrün `--sage-deep`, tiefes Petrol `--petrol` als Akzent, Text `--ink` / `--ink-soft`. `--terracotta-soft` und `--sage` sind nur Dekor, nicht für Text. Neue Farben nur als Token und mit geprüftem Kontrast (WCAG AA).
- Schrift: Fraunces für Titel (`--font-title`), Nunito für Fließtext (`--font-body`), als Paket lokal eingebunden und im Precache. Nur aufrechte Schnitte – kein Kursiv, sonst erzeugt der Browser falsche Schrägen.
- Navigation ab Phase 3: untere Leiste mit Home, Today, Gifts; Einstellungen über ein Symbol oben.
- Safe Area ausschließlich über `--safe-top/right/bottom/left` (in `app.css` aus `env(safe-area-inset-*)` gesetzt), damit Tests sie simulieren können. Hintergründe laufen bis an den Rand, Bedienbares bleibt innerhalb.
- Tap-Ziele mindestens 44 px (`--tap`), `prefers-reduced-motion` beachten, Hochformat; Querformat darf nicht brechen.
- Sichtprüfung je Bildschirm per Screenshot bei 440×956 mit simulierter Safe Area (oben 59 px, unten 34 px).

## Begründete Abweichungen und Setzungen

- **Dunkle Kopfleiste:** Für "Hintergrund bis unter die Uhr" braucht iOS `black-translucent`; die Uhr ist dann immer weiß. Deshalb liegt oben eine Leiste in Petrol statt Creme.
- **SVG-Dateien unter `content/`:** Räume und Stücke liegen als `.svg` neben ihrer `.json` und werden beim Build inline ins Bündel gesetzt (kein Laden zur Laufzeit). So bleiben sie Inhalt statt Code und Kapitel 2 braucht keine Codeänderung. `parseSvg` lehnt Skripte, externe Verweise und Rasterbilder ab.
- **PNG-Icons:** iOS und das Manifest verlangen PNG. Sie werden bei jedem Build aus `public/icon.svg` erzeugt und liegen nicht im Repo.
- **Feste Gutscheine** stehen in `content/` und damit im App-Bündel beider Geräte; sie sind nur in der Oberfläche verhüllt. Die serverseitige Geheimhaltung gilt für das, was Spieler selbst eingeben.
- **TypeScript 6 statt 7:** svelte-check unterstützt TypeScript 7 noch nicht.
- **Name:** voller Name "Nhà Mình – PaarTrip", unter dem Icon "PaarTrip" (dort passen nur rund zwölf Zeichen).

## Arbeitsweise

- Genau den Umfang der Phase bauen; Ideen darüber hinaus in `PROGRESS.md` notieren statt umsetzen.
- Lokale, umkehrbare Schritte selbst machen. Vor push, Löschen von Dateien oder Branches, Datenlöschung und Deploys nach außen den Nutzer fragen. Der Nutzer ist kein Entwickler: Handgriffe außerhalb des Codes Klick für Klick erklären.
- Am Phasenende: Akzeptanz mit echten Checks prüfen, Commit "Phase X: Name", `PROGRESS.md` und `tests.json` aktualisieren, temporäre Hilfsdateien entfernen.

## Subagenten (`.claude/agents/`)

| Name | Modell (Effort) | Wofür |
| --- | --- | --- |
| `explorer` | Haiku 5.5 (medium) | Code finden, Stellen lokalisieren; nur lesend |
| `fliessband` | Haiku 5.5 (high) | gleichartige Kleinaufgaben nach Muster, parallel |
| `zusammenfasser` | Haiku 5.5 (medium) | lange Logs auf die relevanten Fehler eindampfen |
| `pruefer` | Opus 5.5 (medium) | unabhängiges Review am Phasenende; ändert nichts |
| `builder` | Sonnet 5.5 (high) | parallele Standard-Features auf fertiger Architektur |

Parallele Bauarbeit läuft nur über `builder` oder `fliessband`, nie über `general-purpose`. Fehlt ein Subagent in der Sitzung, nicht ausweichen, sondern melden und um einen Neustart der Sitzung bitten. Fließband-Ergebnisse stichprobenartig prüfen und testen, bevor sie übernommen werden.
