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
  rules.ts            Spielregeln: Stand + Aktion → neuer Stand und Push-Auslöser
  view.ts             deriveView: die eine Stelle, die Verborgenes herausfiltert
  wire.ts             Prüfung eingehender Anfragen (zod/mini), limits.ts: Längen und Code-Alphabet
src/                Svelte-App
  lib/                Logik ohne Oberfläche (*.svelte.ts nur, wenn Runen nötig sind); house.ts leitet aus der Sicht ab, was die Oberfläche zeigt
  components/         wiederverwendbare Oberfläche (Kopfleiste, untere Leiste, Abgleich-Hinweis, Blatt, Stück-Zeichnung)
  screens/            ein Ordner je Bildschirm: home (Haus, Bauzug, Erinnerungsstücke), today, gifts, milestone, settings
  sw.ts               eigener Service Worker (Precache, Update, Push-Empfang)
worker/             Cloudflare Worker "paartrip-api" + D1
  src/                index.ts (Routen), store.ts (D1), push.ts + webpush.ts (VAPID, Verschlüsselung)
  migrations/         D1-Schema, fortlaufend nummeriert
  test/               Tests gegen den echten Worker, local-api.ts startet ihn
  wrangler.jsonc      Konfiguration ohne Secrets
scripts/            Build-Helfer (Inhalte bündeln, Icons und iPhone-Startbilder erzeugen; splash-sizes.ts: die eine Liste der Gerätegrößen)
e2e/                Playwright-Tests und Testserver (api-server.ts: lokaler Worker mit den Hilfsrouten /__test/forget-house und /__test/fill-house; phones.ts: gemeinsame Handgriffe der Zwei-Geräte-Tests)
generated/          erzeugt, nicht im Repo (content.json, content-rules.json)
public/icons/       erzeugt, nicht im Repo (PNG-Icons aus public/icon.svg)
public/splash/      erzeugt, nicht im Repo (Startbilder je iPhone-Größe)
screenshots/        erzeugt, nicht im Repo (e2e/screens.spec.ts legt dort jeden Bildschirm zur Sichtprüfung ab)
```

## Architektur

- **Der Server ist die Quelle der Wahrheit.** Je Haus ein `HouseState`. Geräte erhalten ausschließlich die für sie gefilterte `HouseView` und speichern die letzte als lokale Kopie (IndexedDB), damit die App offline mit dem letzten Stand startet. Das Gerät verändert die Sicht nie selbst.
- **Jede Änderung ist eine Aktion** (`shared/actions.ts`) mit auf dem Gerät erzeugter id. Aktionen gehen in eine Warteschlange und werden beim Abgleich eingereicht; der Server wendet jede id höchstens einmal an (`applied` / `duplicate` / `rejected`). Auch eine abgelehnte Aktion verlässt die Warteschlange – kein Gerät darf festhängen.
- **Abgleich** beim Öffnen, bei Rückkehr in die App und nach jeder eigenen Aktion: `POST /sync` reicht Aktionen ein und liefert die neue Sicht.
- **Verborgenes bleibt auf dem Server:** Kennst-du-mich-Antworten vor beidseitiger Abgabe und der Text geheimer Gutscheine vor dem Freischalten stehen in keiner Antwort an das andere Gerät. Die Filterung geschieht an genau einer Stelle (Sicht aus dem Stand ableiten) und ist per Test belegt.
- **Spielregeln sind reine Funktionen in `shared/`** (Stand + Aktion + Inhalte + Serverzeit → neuer Stand), damit Vitest sie ohne Worker prüfen kann. Zeitregeln rechnen mit der Serverzeit und `DAY_TIMEZONE` (Europe/Berlin), nie mit der Gerätezeit.
- **Erledigte Aufgabe → Bauzug → Meilenstein** läuft über die eine Funktion `completeTask` in `shared/rules.ts`: Sie zählt die Aufgabe, legt den Bauzug an (Angebot aus dem Katalog, abhängig nur von Haus-id und Zugnummer – kein Zufall, die Regel bleibt rein) und öffnet am Meilenstein das Geschenk. Der Aufgabenablauf (Phase 4) ruft sie auf. Bis dahin gibt es die Aktion `test.completeTask`; der Server nimmt sie nur an, wenn die Worker-Variable `TEST_ACTIONS` auf `1` steht (lokal und in den Tests an; seit 2026-11-12 auf Wunsch des Nutzers auch im Betrieb, siehe `worker/wrangler.jsonc`), und sagt das der App in `HouseView.testActions`.
- **Die Oberfläche leitet ab und schreibt nichts um:** `src/lib/house.ts` macht aus der Sicht den nächsten Schritt im Haus, Geschenk-Listen und Erinnerungsstücke. Wartende eigene Aktionen (`session.queued`) dienen nur dazu, schon Abgeschicktes nicht noch einmal anzubieten – ein Stück erscheint im Haus erst, wenn der Server es bestätigt hat.
- **Rollen:** Spieler `a` legt das Haus an, `b` tritt bei. Inhalte beziehen sich auf diese Slots (feste Gutscheine sind `from: a`, also legt Alex das Haus an).
- **Inhalte:** `scripts/build-content.ts` prüft jede Datei unter `content/` gegen `shared/content-schema.ts`, hängt `.svg`-Dateien als Inline-SVG an und schreibt `generated/content.json`. App und Worker lesen nur dieses Bündel. Neue Kapitel und Einträge brauchen keine Codeänderung; fehlerhafte Inhalte brechen Typecheck, Tests und Build ab. Setzungen (Meilenstein-Abstände, Zuordnung der festen Gutscheine, Parameter des Bauzugs) stehen in `content/chapter-N/` und sind dort änderbar.
- **Update-Funktion** (`src/lib/update.svelte.ts`, `src/sw.ts`): bei Rückkehr in die App `registration.update()`, höchstens einmal pro Minute; wartet ein neuer Worker, erscheint "New version – Update"; erst auf Tippen `skipWaiting`, bei `controllerchange` lädt die Seite neu. Versionszeile "Version · Build-Zeit · Commit" und Knopf "Check for updates" mit Ergebnis. Die Build-Zeit steckt im Bundle, damit jeder Deploy als neue Version erkannt wird.
- **Worker** (`worker/`): ein Cloudflare Worker mit D1 im Gratis-Tarif. Je Haus eine Zeile mit dem `HouseState` als JSON. Jedes Gerät weist sich mit seinem Token aus (`Authorization: Bearer`, gespeichert ist nur der SHA-256-Hash). Geschrieben wird mit Prüfung der Spalte `rev` statt mit einer Sperre; bei Andrang antwortet der Worker `busy` und das Gerät reicht aus der Warteschlange nach. Jede Route außer `GET /` verlangt den `Origin` der App (`ALLOWED_ORIGIN`). Der Worker importiert `shared/` und `generated/content-rules.json` (Inhalte ohne Bilder und Story). `shared/wire.ts` nutzt `zod/mini`, damit das Bündel klein bleibt (10 ms CPU je Anfrage).
- **Push:** Web Push ohne Bibliothek (`worker/src/webpush.ts`, WebCrypto). Regeln geben Push-Auslöser als `PushEffect[]` zurück, der Worker verschickt sie nach dem Speichern. Der private VAPID-Schlüssel ist ein Worker-Secret (`VAPID_PRIVATE_KEY`), der öffentliche steht in `worker/wrangler.jsonc`.
- **Worker-Tests** laufen über `createTestHarness` aus wrangler gegen echtes workerd mit echter D1 (`worker/test/local-api.ts`); `@cloudflare/vitest-pool-workers` unterstützt Vitest 5 nicht. Schlüssel entstehen bei jedem Testlauf neu.
- **Hosting:** GitHub Pages unter `/paartrip/`. `base` (Vite), `scope` und `start_url` (Manifest) kommen aus der einen Konstante `BASE` in `vite.config.ts`. Workflow bei Push auf `main`: Typecheck → Tests → Build → Worker (Migrationen, Deploy) → Pages. Der Worker kommt zuerst; installierte Apps sprechen bis zum Tippen auf "Update" mit dem neueren Worker – Änderungen an der Schnittstelle müssen die vorige App-Version aushalten.

## Benennung

- Dateien: Svelte-Komponenten `PascalCase.svelte`, alles andere `kebab-case.ts`; Tests daneben als `*.test.ts` (Vitest) bzw. in `e2e/*.spec.ts` (Playwright).
- Relative Importe immer mit Dateiendung (`./model.ts`, `./Banner.svelte`). `shared/` und `scripts/` laufen auch direkt in Node, das die Endung verlangt.
- Inhalts-ids: `kebab-case`, gleich dem Dateinamen. Platz-ids beginnen mit der Raum-id (`kitchen-counter-1`); der Rest wird in der App als Name des Platzes vorgelesen.
- Plätze (`rooms/*.json`): `x`, `y` = Mitte der Unterkante des Felds im Koordinatensystem der Raum-SVG (400 breit), `size` = Kantenlänge des Felds, `kind` = Platzart. Platzarten in Kapitel 1: `wall`, `surface`, `floor`, `ground`, `fence`. Ein Stück (`pieces/*.svg`, viewBox `0 0 100 100`) füllt das Feld und steht bzw. hängt mit seiner Unterkante bei y ≈ 96–100. Innenräume zeichnen ihre Hauswände selbst (10 Einheiten links und rechts); `outdoor: true` stellt einen Raum unter das Haus.
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
- Die App ist seit Phase 1 auf beiden iPhones installiert. `BASE`, Manifest-`id`, `scope` und `start_url` sowie der Dateiname `sw.js` dürfen sich nicht mehr ändern – sonst finden die installierten Apps keine Updates mehr und müssten neu installiert werden. Jeder Push auf `main` landet auf echten Geräten.
- Port 4190 und andere von Browsern gesperrte Ports nicht für Testserver verwenden (WebKit lädt dann nichts).

## Gestaltungsvorgaben

- Warme, flächige Vektorillustration, vollständig als SVG, keine Verläufe-Orgien, keine Konturlinien-Optik. Das Haus als Querschnitt (Puppenhaus), vertikal scrollbar, Plätze als Tippflächen.
- Palette als Tokens in `src/app.css`: Creme `--cream` als Grund, `--cream-deep` für Flächen, Terrakotta `--terracotta`, Salbeigrün `--sage-deep`, tiefes Petrol `--petrol` als Akzent, Text `--ink` / `--ink-soft`. `--terracotta-soft` und `--sage` sind nur Dekor, nicht für Text. Neue Farben nur als Token und mit geprüftem Kontrast (WCAG AA).
- Schrift: Fraunces für Titel (`--font-title`), Nunito für Fließtext (`--font-body`), als Paket lokal eingebunden und im Precache. Nur aufrechte Schnitte – kein Kursiv, sonst erzeugt der Browser falsche Schrägen.
- Navigation: untere Leiste mit Home, Today, Gifts; Einstellungen über ein Symbol oben. Ein Punkt am Reiter zeigt, wo etwas auf diesen Spieler wartet.
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
