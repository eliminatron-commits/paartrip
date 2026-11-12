# CLAUDE.md – Nhà Mình – PaarTrip

Privates Koop-Spiel für genau ein Paar (Alex und seine Frau), als iPhone-PWA ohne App Store. Beide richten gemeinsam ein Haus mit Garten ein; Baufortschritt entsteht nur durch Tagesaufgaben, die beide zusammen erledigen. Sechs Phasen; Stand und nächster Schritt stehen in `PROGRESS.md`, die Akzeptanztests aller Phasen in `tests.json`.

Live-Adresse: `https://eliminatron-commits.github.io/paartrip/` (GitHub Pages, Repo `eliminatron-commits/paartrip`).

## Befehle

Node 24 liegt auf diesem Rechner nicht im PATH. Vor jedem Befehl:
PowerShell `$env:Path = "C:\Program Files\nodejs;" + $env:Path` · Bash `export PATH="/c/Program Files/nodejs:$PATH"`

| Befehl | Zweck |
| --- | --- |
| `npm run dev` | Dev-Server (ohne Service Worker); spricht mit dem Worker aus `npm run dev:api` |
| `npm run dev:api` | der echte Worker lokal (workerd, frische leere D1) auf Port 8787 |
| `npm run typecheck` | svelte-check für `src/` + `shared/`, tsc für Skripte, Tests, Konfiguration und Worker |
| `npm test` | Vitest: Logik und der Worker in lokalem workerd |
| `npm run test:e2e` | baut zwei Versionen nach `dist-e2e/`, startet den lokalen Worker (Port 8788), dann Playwright in WebKit bei 440×956 |
| `npm run build` | Produktions-Build nach `dist/`; bricht ohne `VITE_API_URL` ab (steht in `.env.production`) |
| `npm run content` | prüft `content/` gegen das Schema und baut `generated/content.json` (App) und `generated/content-rules.json` (Worker) |

Einzelner Test: `npx vitest run shared/content-schema.test.ts` bzw. `npx playwright test e2e/update.spec.ts` (vorher einmal `npm run test:e2e`, damit `dist-e2e/` existiert).

Worker von Hand: `npx wrangler deploy --dry-run --config worker/wrangler.jsonc` baut nur das Bündel. Veröffentlicht wird er im Workflow; ein Deploy von Hand ist ein Schritt nach außen und braucht die Zustimmung des Nutzers.

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
  rules.ts            Spielregeln: Stand + Aktion → neuer Stand und Push-Auslöser; advance: der Tagesablauf
  view.ts             deriveView: die eine Stelle, die Verborgenes herausfiltert
  puzzles/            die sechs Rätselarten ohne Oberfläche: Daten prüfen, Lösung nennen, Versuch prüfen
                      (kinds.ts: Rollen und wer die Lösung eingibt; tiles.ts: Zeichenvorrat)
  stored-state.ts     upgradeState: bringt einen gespeicherten Stand früherer Versionen auf die heutige Form
  autoplay.ts         die Schritte, mit denen zwei Spieler eine Aufgabe abschließen – nur für Tests und Testserver
  time.ts             Kalendertag in DAY_TIMEZONE
  wire.ts             Prüfung eingehender Anfragen (zod/mini), limits.ts: Längen und Code-Alphabet
src/                Svelte-App
  lib/                Logik ohne Oberfläche (*.svelte.ts nur, wenn Runen nötig sind); house.ts und tasks.ts leiten aus der Sicht ab, was die Oberfläche zeigt
  components/         wiederverwendbare Oberfläche (Kopfleiste, untere Leiste, Abgleich-Hinweis, Blatt, Stück-Zeichnung, Glyph: Symbole der Rätsel)
  screens/            ein Ordner je Bildschirm: home (Haus, Bauzug, Erinnerungsstücke), today (Tagesaufgabe: PuzzleTask als Hülle,
                      puzzles/ mit einem Baustein je Rätselart, KnowMeTask, Reveal, RealLifeTask), gifts, milestone, settings
  sw.ts               eigener Service Worker (Precache, Update, Push-Empfang)
worker/             Cloudflare Worker "paartrip-api" + D1
  src/                index.ts (Routen), store.ts (D1), push.ts + webpush.ts (VAPID, Verschlüsselung)
  migrations/         D1-Schema, fortlaufend nummeriert
  test/               Tests gegen den echten Worker, local-api.ts startet ihn
  wrangler.jsonc      Konfiguration ohne Secrets
scripts/            Build-Helfer (Inhalte bündeln, Icons und iPhone-Startbilder erzeugen; splash-sizes.ts: die eine Liste der Gerätegrößen)
e2e/                Playwright-Tests und Testserver (api-server.ts: lokaler Worker mit Hilfsrouten unter /__test/ – forget-house, fill-house,
                    next-task, finish-task, open-task; phones.ts: gemeinsame Handgriffe der Zwei-Geräte-Tests;
                    puzzle-drivers/: je Rätselart, wie der Test sie über die Oberfläche spielt)
generated/          erzeugt, nicht im Repo (content.json, content-rules.json)
public/icons/       erzeugt, nicht im Repo (PNG-Icons aus public/icon.svg)
public/splash/      erzeugt, nicht im Repo (Startbilder je iPhone-Größe)
screenshots/        erzeugt, nicht im Repo (e2e/screens.spec.ts legt dort jeden Bildschirm zur Sichtprüfung ab)
```

## Architektur

- **Der Server ist die Quelle der Wahrheit.** Je Haus ein `HouseState`. Geräte erhalten ausschließlich die für sie gefilterte `HouseView` und speichern die letzte als lokale Kopie (IndexedDB), damit die App offline mit dem letzten Stand startet. Das Gerät verändert die Sicht nie selbst.
- **Jede Änderung ist eine Aktion** (`shared/actions.ts`) mit auf dem Gerät erzeugter id. Aktionen gehen in eine Warteschlange und werden beim Abgleich eingereicht; der Server wendet jede id höchstens einmal an (`applied` / `duplicate` / `rejected`). Auch eine abgelehnte Aktion verlässt die Warteschlange – kein Gerät darf festhängen.
- **Abgleich** beim Öffnen, bei Rückkehr in die App und nach jeder eigenen Aktion: `POST /sync` reicht Aktionen ein und liefert die neue Sicht. Von selbst aktualisiert sich die offene App nicht (keine Echtzeit-Anzeige); wer mit offener App auf den anderen wartet, holt dessen Schritt mit "Refresh" in der Kopfleiste (Wunsch des Nutzers, 2026-11-12).
- **Verborgenes bleibt auf dem Server:** Kennst-du-mich-Antworten vor beidseitiger Abgabe und der Text geheimer Gutscheine vor dem Freischalten stehen in keiner Antwort an das andere Gerät. Die Filterung geschieht an genau einer Stelle (Sicht aus dem Stand ableiten) und ist per Test belegt.
- **Spielregeln sind reine Funktionen in `shared/`** (Stand + Aktion + Inhalte + Serverzeit → neuer Stand), damit Vitest sie ohne Worker prüfen kann. Zeitregeln rechnen mit der Serverzeit und `DAY_TIMEZONE` (Europe/Berlin), nie mit der Gerätezeit.
- **Erledigte Aufgabe → Bauzug → Meilenstein** läuft über die eine Funktion `completeTask` in `shared/rules.ts`: Sie zählt die Aufgabe, legt den Bauzug an (Angebot aus dem Katalog, abhängig nur von Haus-id und Zugnummer – kein Zufall, die Regel bleibt rein) und öffnet am Meilenstein das Geschenk. Die Regeln der drei Aufgabentypen rufen sie über `finishTask` auf. Die Aktion `test.completeTask` aus der Bauphase bleibt im Schema bekannt und wird immer abgelehnt – so hängt eine noch nicht aktualisierte App, die sie in der Warteschlange hat, nicht fest.
- **Tagesablauf:** Es gibt immer genau eine aktuelle Aufgabe (`HouseState.task`); die erste erscheint mit dem Einzug des zweiten Spielers. `advance` in `shared/rules.ts` lässt die nächste erscheinen, wenn die laufende von beiden erledigt ist und seit ihrem Erscheinen (`availableOn`) ein neuer Kalendertag in Europe/Berlin begonnen hat – höchstens eine neue Aufgabe pro Tag; nach einer Pause rückt die nächste sofort nach. Der Worker ruft `advance` bei jedem Abgleich und im Cron-Lauf am Morgen auf; das Spiel hängt nie daran, dass der Cron läuft. Die erledigte Aufgabe bleibt stehen, bis die nächste erscheint (`HouseView.nextTaskOn`). Welche Aufgabe als nächste kommt, entscheiden die ids der erledigten, nicht ihre Anzahl (`upcomingTask`): Ändern sich Reihenfolge oder Bestand der Inhalte, kommt keine erledigte wieder und keine neue fällt weg. Eine offene Aufgabe, die die Inhalte nicht mehr kennen, macht sofort der nächsten Platz – auch am Tag ihres Erscheinens, die einzige Ausnahme von "höchstens eine neue Aufgabe pro Tag". Gezählt wird für Bauzug und Meilenstein weiter jede erledigte Aufgabe (`done.length`), auch eine, die es in den Inhalten nicht mehr gibt: Werden die Test-Aufgaben durch die echten ersetzt, muss ein Haus neu beginnen, sonst verschieben sich die Meilensteine.
- **Aufgaben:** `puzzle.solve` (nur wer in der Rätselart handelt), `knowme.submit` (jeder einmal; mit der zweiten Abgabe ist die Aufgabe erledigt und aufgedeckt), `knowme.judge` (nur bei frei getippten Antworten: wer geantwortet hat, entscheidet, ob der Tipp des anderen zählt – darauf wartet nichts) und `reallife.confirm` (der Empfänger; bei `doer: both` beide). Eine Aktion zu einer Aufgabe, die nicht mehr dran ist, wird abgelehnt und verlässt die Warteschlange.
- **Rätsel sind datengetrieben:** Jede Art hat ihre Logik ohne Oberfläche in `shared/puzzles/` (`validate`, `solution`, `isSolved`), ihr Datenschema in `shared/content-schema.ts`, einen Baustein in `src/screens/today/puzzles/` und einen Treiber in `e2e/puzzle-drivers/`. Die Rolle bestimmt die Ansicht (`lead` aus der Inhaltsdatei ist Rolle 1); geprüft wird die Lösung auf dem Gerät des Handelnden, der Server prüft nur, dass er es war. Rätseldaten liegen im Bündel beider Geräte – "jeder sieht nur seine Hälfte" gilt für die Oberfläche. Die Inhaltsprüfung lehnt Varianten ab, die sich widersprechen, unlösbar sind oder ohne Partner lösbar wären – dazu gehört bei jeder der sechs Arten, dass mindestens `MIN_ATTEMPTS` (50, `shared/puzzles/tiles.ts`) verschiedene Eingaben in Frage kommen, denn Fehlversuche sind unbegrenzt und folgenlos. Gezählt wird vorsichtig, also so, als kenne der Ratende die Regeln der Art (Zahl der Verstecke, Zahl der gebrauchten Teile, Länge des Wegs). Eine neue Variante ist eine Datei unter `tasks/` plus ihr Platz in `taskOrder`; eine neue Art braucht Code an den vier genannten Stellen und Texte in `puzzle-texts.ts`.
- **Zwischenstand einer Aufgabe** (gelegte Teile, getippte Antworten) und die schon gezeigten Erklärungen liegen in den Einstellungen des Geräts (`Settings.draft`, `Settings.introSeen` in `src/lib/store.ts`): Gelöst wird im Gespräch, also oft mit einem Wechsel in den Messenger, und iOS beendet die App dabei ohne Vorwarnung.
- **Die Oberfläche leitet ab und schreibt nichts um:** `src/lib/house.ts` macht aus der Sicht den nächsten Schritt im Haus, Geschenk-Listen und Erinnerungsstücke. Wartende eigene Aktionen (`session.queued`) dienen nur dazu, schon Abgeschicktes nicht noch einmal anzubieten – ein Stück erscheint im Haus erst, wenn der Server es bestätigt hat.
- **Rollen:** Spieler `a` legt das Haus an, `b` tritt bei. Inhalte beziehen sich auf diese Slots (feste Gutscheine sind `from: a`, also legt Alex das Haus an).
- **Inhalte:** `scripts/build-content.ts` prüft jede Datei unter `content/` gegen `shared/content-schema.ts`, hängt `.svg`-Dateien als Inline-SVG an und schreibt `generated/content.json`. App und Worker lesen nur dieses Bündel. Neue Kapitel und Einträge brauchen keine Codeänderung; fehlerhafte Inhalte brechen Typecheck, Tests und Build ab. Setzungen (Meilenstein-Abstände, Zuordnung der festen Gutscheine, Parameter des Bauzugs) stehen in `content/chapter-N/` und sind dort änderbar.
- **Update-Funktion** (`src/lib/update.svelte.ts`, `src/sw.ts`): bei Rückkehr in die App `registration.update()`, höchstens einmal pro Minute; wartet ein neuer Worker, erscheint "New version – Update"; erst auf Tippen `skipWaiting`, bei `controllerchange` lädt die Seite neu. Versionszeile "Version · Build-Zeit · Commit" und Knopf "Check for updates" mit Ergebnis. Die Build-Zeit steckt im Bundle, damit jeder Deploy als neue Version erkannt wird.
- **Worker** (`worker/`): ein Cloudflare Worker mit D1 im Gratis-Tarif. Je Haus eine Zeile mit dem `HouseState` als JSON; beim Laden bringt `upgradeState` (`shared/stored-state.ts`) Stände früherer Versionen auf die heutige Form – ein neues Pflichtfeld im Stand braucht dort eine Zeile und einen Test mit einem Altstand. Jedes Gerät weist sich mit seinem Token aus (`Authorization: Bearer`, gespeichert ist nur der SHA-256-Hash). Geschrieben wird mit Prüfung der Spalte `rev` statt mit einer Sperre; bei Andrang antwortet der Worker `busy` und das Gerät reicht aus der Warteschlange nach. Jede Route außer `GET /` verlangt den `Origin` der App (`ALLOWED_ORIGIN`). Der Worker importiert `shared/` und `generated/content-rules.json` (Inhalte ohne Bilder und Story). `shared/wire.ts` nutzt `zod/mini`, damit das Bündel klein bleibt (10 ms CPU je Anfrage).
- **Push:** Web Push ohne Bibliothek (`worker/src/webpush.ts`, WebCrypto). Regeln geben Push-Auslöser als `PushEffect[]` zurück, der Worker verschickt sie nach dem Speichern. Jeder Schritt des einen an einer Aufgabe geht als "partner_done" an den anderen. "new_task" kommt aus dem Cron-Lauf (`0 6 * * *` UTC, also 07:00 bzw. 08:00 Uhr in Berlin): `announceTask` nennt, wer an der heute erschienenen Aufgabe seinen Teil noch nicht getan hat – nie für eine ältere Aufgabe, also nie als Mahnung. Der private VAPID-Schlüssel ist ein Worker-Secret (`VAPID_PRIVATE_KEY`), der öffentliche steht in `worker/wrangler.jsonc`.
- **Stellbare Uhr nur für Tests:** Mit der Worker-Variable `TEST_CLOCK=1` (gesetzt in `worker/test/local-api.ts`, nicht in `wrangler.jsonc`) gilt der Kopf `X-Test-Now` als Serverzeit. Worker-Tests schicken ihn direkt, Browser-Tests über `setClock` in `e2e/phones.ts`; den Cron-Lauf löst das Test-Geschirr mit `scheduled({ scheduledTime })` aus.
- **Worker-Tests** laufen über `createTestHarness` aus wrangler gegen echtes workerd mit echter D1 (`worker/test/local-api.ts`); `@cloudflare/vitest-pool-workers` unterstützt Vitest 5 nicht. Schlüssel entstehen bei jedem Testlauf neu.
- **Hosting:** GitHub Pages unter `/paartrip/`. `base` (Vite), `scope` und `start_url` (Manifest) kommen aus der einen Konstante `BASE` in `vite.config.ts`. Workflow bei Push auf `main`: Typecheck → Tests → Build → Worker (Migrationen, Deploy) → Pages. Der Worker kommt zuerst; installierte Apps sprechen bis zum Tippen auf "Update" mit dem neueren Worker – Änderungen an der Schnittstelle müssen die vorige App-Version aushalten.

## Benennung

- Dateien: Svelte-Komponenten `PascalCase.svelte`, alles andere `kebab-case.ts`; Tests daneben als `*.test.ts` (Vitest) bzw. in `e2e/*.spec.ts` (Playwright).
- Relative Importe immer mit Dateiendung (`./model.ts`, `./Banner.svelte`). `shared/` und `scripts/` laufen auch direkt in Node, das die Endung verlangt.
- Inhalts-ids: `kebab-case`, gleich dem Dateinamen. Platz-ids beginnen mit der Raum-id (`kitchen-counter-1`); der Rest wird in der App als Name des Platzes vorgelesen.
- Plätze (`rooms/*.json`): `x`, `y` = Mitte der Unterkante des Felds im Koordinatensystem der Raum-SVG (400 breit), `size` = Kantenlänge des Felds, `kind` = Platzart. Platzarten in Kapitel 1: `wall`, `surface`, `floor`, `ground`, `fence`. Ein Stück (`pieces/*.svg`, viewBox `0 0 100 100`) füllt das Feld und steht bzw. hängt mit seiner Unterkante bei y ≈ 96–100. Innenräume zeichnen ihre Hauswände selbst (10 Einheiten links und rechts); `outdoor: true` stellt einen Raum unter das Haus.
- Rätseldaten: Raster als Zeilen aus Zeichen (Grundriss: `#` Wand, `.` Boden, `a`–`z` Zeichen, `1`–`9` Versteck; Labyrinth: `#`, `.`, `S`, `G`). Der Grundriss ist höchstens 6 breit (seine Verstecke werden angetippt und müssen auch bei 375 px Breite 44 px messen), das Labyrinth höchstens 8. Symbole heißen wie in `shared/puzzles/tiles.ts` (`GLYPHS`).
- Kennzeichen der Aufgaben für Tests: die Karte `data-testid="task"` mit `data-task`, `data-type`, bei Rätseln `data-kind` und `data-role`; `task-done`, `task-sent`, `task-waiting`, `reveal`. Jeder Rätsel-Baustein: `puzzle-input` genau beim Handelnden, `puzzle-feedback` (leer, bis ein Versuch falsch war), `puzzle-check`, wenn es einen Prüf-Knopf gibt.
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
- Kein Rätsel-Baustein, der je Feld oder Schritt verrät, ob es stimmt (kein Anstoßen an Wände, kein "richtig" beim Antippen): Geprüft wird nur der ganze Versuch, sonst ließe sich das Rätsel allein durch Probieren lösen. Die Ansicht einer Rolle enthält die Hälfte der anderen auch nicht versteckt im DOM.
- Keine Farbe als Informationsträger in Rätseln: Symbole unterscheiden sich allein durch ihre Form.
- Kein Rätselinhalt, der die Hälfte des anderen überflüssig macht: kein Zeichen in Karte und Legende, das an seine Bedeutung erinnert (Blatt für die Pflanze), kein Titel, der die Lösung nennt. Die Inhaltsprüfung fängt nur die wörtliche Übereinstimmung von Zeichenname und Bedeutung ab; den Rest beurteilt ein Mensch oder `pruefer`.
- Tests nicht löschen oder abschwächen, um sie grün zu bekommen; keine hartcodierten Werte für Testfälle.
- Die App ist seit Phase 1 auf beiden iPhones installiert. `BASE`, Manifest-`id`, `scope` und `start_url` sowie der Dateiname `sw.js` dürfen sich nicht mehr ändern – sonst finden die installierten Apps keine Updates mehr und müssten neu installiert werden. Jeder Push auf `main` landet auf echten Geräten.
- Port 4190 und andere von Browsern gesperrte Ports nicht für Testserver verwenden (WebKit lädt dann nichts).

## Gestaltungsvorgaben

- Warme, flächige Vektorillustration, vollständig als SVG, keine Verläufe-Orgien, keine Konturlinien-Optik. Das Haus als Querschnitt (Puppenhaus), vertikal scrollbar, Plätze als Tippflächen.
- Palette als Tokens in `src/app.css`: Creme `--cream` als Grund, `--cream-deep` für Flächen, Terrakotta `--terracotta`, Salbeigrün `--sage-deep`, tiefes Petrol `--petrol` als Akzent, Text `--ink` / `--ink-soft`. `--terracotta-soft` und `--sage` sind nur Dekor, nicht für Text. Neue Farben nur als Token und mit geprüftem Kontrast (WCAG AA).
- Schrift: Fraunces für Titel (`--font-title`), Nunito für Fließtext (`--font-body`), als Paket lokal eingebunden und im Precache. Nur aufrechte Schnitte – kein Kursiv, sonst erzeugt der Browser falsche Schrägen.
- Navigation: untere Leiste mit Home, Today, Gifts; oben Symbole für "Refresh" (nur mit Haus) und Einstellungen. Ein Punkt am Reiter zeigt, wo etwas auf diesen Spieler wartet.
- Die App füllt genau den Bildschirm (`100dvh`); gescrollt wird nur im Inhaltsbereich zwischen Kopf- und Fußleiste. Kein Scrollbereich reicht unter den Home-Indikator.
- Safe Area ausschließlich über `--safe-top/right/bottom/left` (in `app.css` aus `env(safe-area-inset-*)` gesetzt), damit Tests sie simulieren können. Hintergründe laufen bis an den Rand, Bedienbares und Text bleiben innerhalb.
- Tap-Ziele mindestens 44 px (`--tap`), `prefers-reduced-motion` beachten, Hochformat; Querformat darf nicht brechen.
- Farben in Komponenten nur über die Tokens aus `app.css` (`scripts/contrast.test.ts` prüft Kontraste und dass keine Komponente eigene Farbwerte setzt). `--wall` und `--wood` gehören zur Galerie unter dem Dach.
- Sichtprüfung je Bildschirm per Screenshot bei 440×956 mit simulierter Safe Area (oben 59 px, unten 34 px): `e2e/screens.spec.ts` legt die Bilder nach `screenshots/` und prüft dabei, dass in den Rändern weder Text noch Bedienbares liegt.

## Begründete Abweichungen und Setzungen

- **Dunkle Kopfleiste:** Für "Hintergrund bis unter die Uhr" braucht iOS `black-translucent`; die Uhr ist dann immer weiß. Deshalb liegt oben eine Leiste in Petrol statt Creme.
- **SVG-Dateien unter `content/`:** Räume und Stücke liegen als `.svg` neben ihrer `.json` und werden beim Build inline ins Bündel gesetzt (kein Laden zur Laufzeit). So bleiben sie Inhalt statt Code und Kapitel 2 braucht keine Codeänderung. `parseSvg` lehnt Skripte, externe Verweise und Rasterbilder ab.
- **PNG-Icons:** iOS und das Manifest verlangen PNG. Sie werden bei jedem Build aus `public/icon.svg` erzeugt und liegen nicht im Repo.
- **Feste Gutscheine** stehen in `content/` und damit im App-Bündel beider Geräte; sie sind nur in der Oberfläche verhüllt. Die serverseitige Geheimhaltung gilt für das, was Spieler selbst eingeben.
- **Der Schutz hängt am Token, nicht am Origin:** Die Origin-Prüfung des Workers hält nur fremde Webseiten im Browser ab; außerhalb des Browsers lässt sich der Kopf frei setzen. `https://eliminatron-commits.github.io` ist außerdem die Herkunft aller Pages-Seiten dieses GitHub-Kontos, und IndexedDB gilt je Herkunft – jede dieser Seiten könnte das Token lesen. Unter diesem Konto deshalb keine Pages-Seite betreiben, die fremde Inhalte oder Skripte ausführt. `MAX_HOUSES` ist eine Bremse, kein Schutz: Wer die Adresse kennt, kann die Grenze füllen; bestehende Häuser berührt das nicht.
- **Rollenwechsel auf dem Gerät** (Import einer Sicherung, "Start over") laufen über `SyncEngine.switchDevice`: Solange wartet oder ruht der Abgleich, damit nie eine Aktion mit dem Token der vorigen Rolle hinausgeht. "Start over" gibt es nur, wenn der Server das Gerät nicht mehr kennt (`unauthorized` / `not_found`).
- **Dekostück im Meilenstein-Geschenk:** Es bekommt keinen eigenen Bauzug. Wer zuerst kommt, stellt es mit `piece.move` auf einen passenden freien Platz; danach lässt es sich wie jedes Stück umstellen.
- **Geheime Gutscheine nach dem letzten Meilenstein:** Hinterlegen ist dann geschlossen (es gibt keinen nächsten Meilenstein im Kapitel); die Gifts-Seite sagt das.
- **Push im Bauzug:** Hat einer gewählt, bekommt der andere die Mitteilung "partner_done" – er ist mit Platzieren an der Reihe. Allgemein gilt: Wer eine Aktion selbst ausgelöst hat, bekommt dazu keine Mitteilung (`applyRule` in `shared/rules.ts`).
- **Bauzüge laufen einer nach dem anderen:** Dran ist immer der älteste offene Zug (`activeTurn`); ein wartender bekommt sein Angebot erst, wenn er dran ist – aus dem, was dann noch zu haben ist und ins Haus passt (`withActiveOffer`). Umstellen und das Aufstellen eines Dekostücks dürfen dem offenen Zug nie den letzten Platz nehmen (`moveSpotsFor`). So bleibt kein Bauzug hängen, auch wenn der Katalog mehr Stücke einer Platzart hat als das Haus Plätze. Passt für einen Zug gar nichts mehr, entfällt er; die Aufgabe zählt trotzdem.
- **Mehr Plätze als Bauzüge:** Kapitel 1 hat 34 Plätze für 30 Bauzüge und bis zu 3 Dekostücke (wall 8, surface 9, floor 6, ground 8, fence 3). Ein Dekostück hat keinen Vorrang vor dem Bauzug: Sind alle Plätze seiner Art besetzt, wartet es, bis einer frei wird.
- **Tagesregel (vom Nutzer bestätigt):** höchstens eine neue Aufgabe pro Kalendertag. Wer eine Aufgabe von Montag erst am Mittwoch erledigt, bekommt die nächste sofort am Mittwoch, die übernächste frühestens am Donnerstag.
- **Frei getippte Antworten (vom Nutzer entschieden):** Niemand vergleicht automatisch. Wer geantwortet hat, sieht nach dem Aufdecken den Tipp des anderen und entscheidet, ob er zählt.
- **Aufgedeckte Fragen auf Today:** Die zuletzt erledigte Aufgabe bleibt, wenn sie eine Frage war, aufgedeckt stehen, bis die nächste Aufgabe erledigt ist – auch wer erst am nächsten Tag wiederkommt, sieht das Ergebnis. Ältere Fragen stehen dort nur, solange die eigene Entscheidung aussteht.
- **Karte und Legende:** Gesucht sind mehrere Verstecke auf einmal, und geprüft wird nur die ganze Auswahl. Mit einem einzigen Versteck wäre das Rätsel nach wenigen Versuchen allein gelöst – Fehlversuche bleiben unbegrenzt und ohne Strafe, also muss die Zahl der möglichen Auswahlen groß genug sein.
- **Zwei Bilder vergleichen:** Beide markieren, aber die erste richtige Markierung schließt die Aufgabe für beide ab ("das Ergebnis schließt die Aufgabe für beide ab").
- **Wegweiser:** Wer steuert, geht durch Wände, ohne es zu merken; erst am Ziel zeigt sich, ob der Weg frei war, dann geht es zurück zum Start.
- **Punkt am Reiter Today:** bei einem offenen Rätsel für beide, bei einer Frage für den, der noch nicht abgegeben hat, bei einer Aufgabe im echten Leben nur für den, der bestätigt – ob der andere sie draußen schon erledigt hat, weiß die App nicht.
- **Morgen-Mitteilung:** Die Aufgabe erscheint um Mitternacht, die Mitteilung kommt um 06:00 UTC, damit niemand nachts geweckt wird. Fällt ein Cron-Lauf aus, gibt es an dem Tag keine – gespielt wird trotzdem. Der Worker merkt sich nicht, dass er sie verschickt hat: Liefe der Cron an einem Morgen zweimal, käme sie doppelt (ein Merker kostete je Haus und Lauf einen Schreibzugriff). Der Lauf ist für das eine Haus gebaut: Je Haus fallen bis zu sechs Zugriffe auf Datenbank und Push-Dienst an, der Gratis-Tarif erlaubt 50 Unteranfragen je Lauf – vorsichtig gerechnet reicht das für rund acht Häuser mit Mitteilungen (`MAX_HOUSES` ist 20; ob Datenbankzugriffe mitzählen, ist nicht nachgemessen). Darüber fielen Mitteilungen aus, das Spiel liefe weiter.
- **Keine "neue Aufgabe" beim Nachrücken:** Rückt eine Aufgabe nach einer Pause sofort nach, gibt es dafür keine eigene Mitteilung. Wer den letzten Schritt getan hat, sieht sie in der App; der andere bekommt "partner_done" und findet sie beim Öffnen. "new_task" kommt nur am Morgen.
- **Startbilder nicht im Precache:** iOS holt sie beim Ablegen auf dem Home-Bildschirm; im Precache wären sie nur Ballast.
- **Ton im Test:** Der Test-Browser hat kein Audio (der Konstruktor von `AudioContext` wirft dort). `e2e/settings.spec.ts` setzt deshalb einen Zähler mit derselben Schnittstelle ein und prüft den Weg von der Geste bis zum Ton; wie es klingt, lässt sich nur auf dem Gerät beurteilen.
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
