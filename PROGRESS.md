# PROGRESS – Nhà Mình – PaarTrip

Wiedereinstieg: diese Datei, `tests.json`, `git log`. Regeln und Architektur: `CLAUDE.md`.

## Stand

- **Phase 1/6 – Fundament:** abgeschlossen am 2026-11-11, alle Akzeptanzpunkte P1-01 bis P1-08 erfüllt. Live unter `https://eliminatron-commits.github.io/paartrip/` (Repo `eliminatron-commits/paartrip`, öffentlich, Pages über GitHub Actions). Der Update-Ablauf ist auch live über einen echten zweiten Deploy belegt.
- **Phase 2/6 – Abgleich und Push:** abgeschlossen am 2026-11-12, P2-01 bis P2-10 erfüllt, live seit Commit `a45b30d`. P2-11 (Push-Mitteilung auf dem iPhone) prüft der Nutzer.
- **Phase 3/6 – Haus und Gutscheine:** abgeschlossen am 2026-11-12, P3-01 bis P3-09 erfüllt. Mit Zustimmung des Nutzers am 2026-11-12 hochgeladen, mit eingeschaltetem Test-Knopf.
- **Phase 4/6 – Aufgaben und Rätsel:** abgeschlossen am 2026-11-12, P4-01 bis P4-07 erfüllt. Mit Zustimmung des Nutzers am 2026-11-12 hochgeladen, live seit Commit `7947867` – mit zehn Test-Aufgaben, zum Ausprobieren (siehe unten).
- **Phase 5/6 – Inhalte Kapitel 1:** abgeschlossen am 2026-11-12, P5-01 bis P5-06 erfüllt. Zusammen mit "Refresh" und der Optik-Phase hochgeladen (siehe nächste Zeile).
- **Optik-Phase (vom Nutzer gewünscht, eingeschoben vor der Abnahme) | Opus 5.5 (hoch):** abgeschlossen am 2026-11-13, PO-01 bis PO-06 erfüllt (Stil vom Nutzer freigegeben). Phase 5, "Refresh" und die Optik mit Zustimmung des Nutzers am 2026-11-13 hochgeladen, live seit Commit `396507d` (Workflow grün: Build samt aller Tests 11 Minuten, Worker, Pages; die Live-Adresse liefert den neuen Stand). Laut Nutzer am 2026-11-13 auf beiden iPhones angekommen. Einzelheiten: Abschnitt "Optik-Phase" unten. Der Projekt-Prompt liegt nicht im Repo; er steht im Sitzungsverlauf oder der Nutzer fügt ihn wieder ein.
- **Phase 6/6 – Abnahme:** abgeschlossen am 2026-11-13, P6-01 bis P6-06, P6-09 bis P6-11 und P6-13 bis P6-15 erfüllt; P6-07 (Ton) und P6-08 (Push) prüft der Nutzer auf den iPhones, bei P6-12 den Tarif im Cloudflare-Dashboard. Anleitung für beide Spieler: `ANLEITUNG.md`. Einzelheiten: Abschnitt "Phase 6/6" unten.
- **Auf beiden iPhones installiert** (vom Nutzer gemeldet am 2026-11-11, Stand Phase 1). Seitdem erreicht jeder Push auf `main` zwei echte Geräte. Der Update-Ablauf nach einem echten Deploy (`7027c8e` → `50fb2a7`) hat laut Nutzer auf beiden iPhones funktioniert. Noch nicht auf dem Gerät bestätigt: Darstellung unter Uhr und Dynamic Island.
- Phase 1 lief auf Fable 5.2 statt Opus 5.5. Ein Review durch `pruefer` fand nicht statt, weil die Subagenten erst nach dem Neustart geladen sind.
- Commits tragen die anonyme GitHub-Adresse (lokale Git-Einstellung dieses Repos), damit die private E-Mail-Adresse nicht im öffentlichen Repo steht.

## Phase 6/6 – Abnahme: abgeschlossen am 2026-11-13

**Nutzer am 2026-11-13:** "update angekommen. sieht gut aus. Wenn sonst alles fertig ist, können wir die stände zurücksetzen und wir koppeln neu."

**Belegt am 2026-11-13** (Einzelheiten je Punkt in `tests.json`, Block Phase 6):
- Typecheck 0 Fehler, Vitest 339/339 (darunter der Durchlauf des ganzen Kapitels gegen den echten Worker, `worker/test/chapter.test.ts`), Build grün.
- Playwright: Zwei volle Läufe liefen unter starker Last durch andere Sitzungen auf dem Rechner (9,7 bzw. 7,6 statt sonst 3,4 Minuten). Sie endeten mit 5 bzw. 3 roten Tests, alle wegen Zeitüberschreitung oder zu knapper Wartezeit. Jeder dieser Tests war einzeln wiederholt grün, `e2e/puzzles.spec.ts` auch komplett (14/14). Der Code ist seit dem letzten vollen grünen Lauf (56/56, Optik-Phase) und dem grünen Workflow für `396507d` unverändert.
- Keine Secrets in Arbeitsbaum und Git-Historie. Cloudflare nur im Rahmen des Gratis-Tarifs (Worker-Bündel 117,5 KiB, gzip 29,3 KiB; 1 Cron; 1 D1).
- Das Update ist auf beiden iPhones angekommen (Nutzer).

**Echte Datenbank geleert am 2026-11-13** (Zustimmung des Nutzers, siehe oben): 4 Häuser, 8 Geräte und 6 Aktionen aus den Probeläufen gelöscht, Push-Anmeldungen gab es keine; `d1_migrations` unberührt, Worker antwortet. Vorher als SQL gesichert (nur lokal, nicht im Repo). Die Geräte zeigen danach "This phone isn't linked to the house anymore." → Start over → neu koppeln (Alex legt an), siehe `ANLEITUNG.md`.

**Vom Nutzer zu prüfen:** Ton nach Sperre und App-Wechsel (P6-07), Push auf beiden iPhones nach dem neuen Koppeln (P6-08), Darstellung unter Uhr und Dynamic Island auf dem Gerät.

**Beobachtung:** Unter Last scheitern im vollen Lauf am ehesten die Zwei-Geräte-Tests mit vielen Abgleichen (`puzzles.spec.ts` split-code-1 und sequence-1, `house.spec.ts`). Der Grund ist Zeit, nicht der Code. Wird das lästig, hilft im vollen Lauf ein Worker weniger (`workers` in `playwright.config.ts`), statt Zeitgrenzen weiter anzuheben.

## Optik-Phase: abgeschlossen am 2026-11-13

**Richtung des Nutzers (2026-11-12/13, wörtlich):** "grafik soll cozy, romantic sein, ohne übertrieben in kitsch zu geraten!!!! Nur romantisch angehaucht, sehr cozy. SEHR BEEINDRUCKEND visuell." Dazu: Dinge zu zweit sollen erkennbar seins und ihres sein ("dass ihre handschuhe kleiner sind als meine zum beispie. Sowas gibt einen gewissen detailtouch"). Und zur Probe: "es stört mich den mond doppelt sehen zu können" – der Mond steht nur noch über dem Dach, nicht mehr im Fenster.

**Die Probe (gebaut, lokal gesichert, vom Nutzer am 2026-11-13 freigegeben):** Home-Bildschirm mit Abendhimmel, Dach, Dachboden und Wohnzimmer samt sechs Stücken (Sofa, Sessel, Stehlampe, Monstera, Bild, Kerzen). Bilder: `screenshots/probe/vorher-nachher-home.png` und `nachher-detail.png` (nicht im Repo).

**Was dafür gebaut ist:**
- **Vordergrund je Raum:** `rooms/<id>.front.svg` liegt über den Stücken (Licht der Hängelampe, Halbdunkel in den Ecken, Hauswände im Schnitt) – `Room.front`, optional. So liegt das Licht auch auf den Stücken, und ein Lichtschein endet an der Hauswand.
- **Dach als Inhalt:** `content/chapter-N/roof.svg` (`Chapter.roof`, optional) – Dach, Mond, Sterne, Rauch, zwei Vögel. Den Himmel dahinter malt die App aus den Tokens (`.sky` in HomeScreen, `.crown` in House), die Zeichnung ist dort durchsichtig. Ein anderes Kapitel kann ein anderes Dach mitbringen.
- **Licht der Stücke:** Lampen und Kerzen zeichnen ihren Schein selbst, über ihr Feld hinaus (`overflow="visible"` in RoomView, `overflow: visible` in PieceArt). Wer eine Lampe aufstellt, macht den Raum heller.
- **Bewegung:** Die Zeichnungen nennen nur, was sich regt (`class="fx-flicker|fx-twinkle|fx-steam|fx-smoke|fx-drift"`); wie, steht in `src/app.css`. Bewegt werden nur kleine Teile; bei "Bewegung reduzieren" steht alles.
- **Meilensteine als Laternen** an einer Schnur (HomeScreen), erreichte leuchten. Neue Tokens `--dusk`, `--mauve`, `--afterglow`, `--lantern`, mit Kontrastprüfung.
- **Regel für die Zeichnungen:** Jede `id` in einer SVG beginnt mit der id der Datei (`sofa-shadow`, `living-room-wall`, beim Dach `roof-`, beim Vordergrund `<raum>-front-`), in Komponenten mit `ui-`. Alle Zeichnungen stehen inline in derselben Seite; gleiche ids aus verschiedenen Dateien würden sich gegenseitig die Verläufe nehmen. Keine SVG-Filter (Weichheit über Verläufe) – Filter würden bei jeder Bewegung neu gerechnet.

**Belegt am 2026-11-13:** Typecheck 0 Fehler, 323 Vitest-Tests, 54 Playwright-Tests (53 und der Hilfs-Test der Probe) in einem Lauf.

**Ausgerollt am 2026-11-13 (nach der Freigabe):**
- **Küche** (`kitchen.svg` + `kitchen.front.svg`): halbhoch gefliest, Abendfenster mit Kräutern und Leinenrollo, Schränke in Petrol mit leuchtendem Backofen, Holzplatte, Läufer, Emaille-Hängelampe; das Paar: zwei Topfhandschuhe (groß in Petrol, klein in Rosé).
- **Garten** (`garden.svg` + `garden.front.svg`): Dämmerung ohne Mond, Hecke, Holzzaun mit Querlatte, Nachbardächer, Glühwürmchen, im Vordergrund Gras und ein Zweig; das Paar: zwei Paar Gummistiefel am Zaun.
- **Alle 45 Stücke** im neuen Stil (Schatten, Verläufe, Lichtschein bei Laterne, Lichterkette, Seidenlaterne, Grill, Zwerg). Wo es passt, "seins und ihres": Phở-Schalen, Kaffeegläser, Tassen an der Teekanne, Pfeffermühle und Salzstreuer, Krüge, Stuhlkissen, Bankkissen, Koi, Lotusblüten, Vögel, Zapfen der Kuckucksuhr.
- **Neue Bewegung `fx-sway`** (pendelt um den Aufhängepunkt): Pendel, Quaste, Windspiel, Glücksumschläge.
- **Prüfung der ids** in `checkContent`, mit Test: Jede id einer Zeichnung beginnt mit der id ihrer Datei (Raum, `<raum>-front-`, Stück, `roof-`).
- **Übrige Bildschirme:** Today, Gifts und Einstellungen beginnen unter demselben Abendhimmel (`.dusk` in `app.css`, der Inhalt liegt als helles Blatt mit runden Ecken darüber; der Stand "x of 30" steht bei Today im Kopf). Willkommen zeigt das Dach des ersten Kapitels über dem Blatt. Meilenstein-Szene mit Himmel, Lichterkette und plastischem Geschenk. Karten, Knöpfe, Geschenk-Zeilen und die Auswahl im Bauzug liegen mit Schatten auf (`--lift`); Sterne als `--stars`.

Der Nutzer hat die Bilder von Küche, Garten und den übrigen Bildschirmen am 2026-11-13 gesehen: "bilder sind gut!".

**Danach gebaut (2026-11-13):**
- **Übergänge** (`src/lib/motion.ts`): Ein Stück, das ins Haus kommt (auch umgestellt), sinkt ein paar Einheiten ein, staucht sich beim Aufsetzen und federt nach; am Boden weitet sich ein heller Hauch und verfliegt. Beim Öffnen des Hauses steht alles still. Ein neuer Bildschirm (Reiter, Einstellungen) blendet auf und rückt ein paar Pixel nach oben. Bei "Bewegung reduzieren" nichts davon – Svelte spielt Übergänge über die Web Animations API, die die CSS-Regel nicht erreicht, deshalb fragt jede Funktion selbst nach. Belegt in `e2e/house.spec.ts` ("ein Stück, das dazukommt, setzt sich ab …") und `e2e/shell.spec.ts` ("ein neuer Bildschirm blendet auf …"); beide schlagen nachweislich an, wenn die Abfrage fehlt. Sie halten über `recordMotion` (`e2e/phones.ts`) fest, welche Bewegung begonnen hat, statt sie im Flug zu erwischen – unter Last waren 240 bzw. 620 ms oft vorbei, bevor der Test nachsah.
- **Querformat:** Neben dem Haus liegt die Abendlandschaft statt der einfarbigen Fläche – unter der Traufe glimmt das Abendrot nach, nach unten wird es Nacht mit Sternen, auf Höhe des Sockels dunkle Hügel, neben dem Garten dunkler Boden mit Glühwürmchen. Ist neben dem Haus Platz, scheint sein warmes Licht hinaus.
- **Durchgesehen:** Rätsel-Bausteine und die Leiste beim Platzieren passen zum neuen Stil und bleiben, wie sie sind – beim Rätseln geht Lesbarkeit vor Stimmung.
- Das Stück `candle` heißt jetzt "Two candles" (die id bleibt).
- **Sichtprüfung des eingerichteten Hauses:** `e2e/screens.spec.ts` legt nach dem vollen Haus jeden Raum im Hoch- und im Querformat ab und prüft die Ränder. Die Hilfsroute `fill-house` stellt dafür echte Stücke aus dem Angebot auf (vorher Platzhalter, die nicht zu sehen waren). Der vorübergehende `e2e/optik-probe.spec.ts` ist entfernt.
- Gestaltungsvorgaben in `CLAUDE.md` neu gefasst.
- **Fehler gefunden und behoben:** Ein leuchtender Platz (und ein Stück im Haus) sprang beim Drücken um eine halbe Breite nach rechts unten. Die Plätze standen über `transform: translate(-50%, -50%)` auf ihrem Feld, und `button:active` in `app.css` überschrieb genau dieses `transform`. Normal glitt der Platz in 0,12 s weg, mit "Bewegung reduzieren" sprang er sofort – das Loslassen landete daneben, das Antippen kam nicht an. Daran schwankte der Übergangs-Test. Jetzt zentriert die eigene Eigenschaft `translate` (RoomView). Belegt durch den neuen Test "ein gedrückter Platz bleibt unter dem Finger …" (mit dem alten Stand rot: 24–42 px Sprung) und 12 von 12 grünen Läufen beider Tests unter Last; der Übergangs-Test selbst ist unverändert.
- Der Titel von `describe-arrange-2` heißt jetzt "The kitchen shelf, just so" (vorher "The spice rack …", passte nicht zu Tassen und zum Text der Rätselart – notiert in Phase 5).

**Review durch `pruefer` (Opus 5.5):** nichts Kritisches. Wichtig: feste `rgb()`-Werte in sechs Komponenten (aus früheren Phasen), die der Farbtest nicht fand – jetzt `color-mix` mit Token, und `scripts/contrast.test.ts` sucht auch nach `rgb()`/`hsl()`; für das Aufblenden fehlte ein Browser-Test (ergänzt); `PROGRESS.md` und `tests.json` meldeten die Phase vor dem grünen Lauf als erfüllt (erst danach gesetzt). Klein: Bilder der Sichtprüfung konnten mitten im Aufblenden entstehen (`check()` wartet jetzt), ein Kommentar in `apple-tree.svg` passte nicht zur Zeichnung. `pruefer` hat die Korrekturen gegengelesen: nichts mehr offen.

**Zeitgrenze der Browser-Tests:** 60 s statt 30 s (`playwright.config.ts`). Zwei-Geräte-Tests brauchen auf diesem Rechner allein bis zu 27 s; mit fremden Läufen daneben rissen sie die Grenze. Die Prüfungen sind dieselben.

**Belegt am 2026-11-13 (Abschluss):** Typecheck 0 Fehler, 339 Vitest-Tests, 56 von 56 Browser-Tests in einem Lauf allein (3,4 Minuten).

**Nicht belegt:** Ob Haus und Übergänge auf dem iPhone flüssig laufen, ist nicht gemessen; Bewegung lässt sich an Standbildern nicht beurteilen. Hochgeladen am 2026-11-13; auf den iPhones noch nicht bestätigt.

**Fehler aus Phase 5, behoben am 2026-11-13:** `worker/test/chapter.test.ts` schwankte (drei von sechs Läufen rot): Am Meilenstein 25 fand das Vogelbad je nach Haus-id keinen freien Gartenplatz. Dahinter steckte ein Fehler der Regeln: War eine Platzart mit Stücken voll, die nur dorthin passen, wurde nie wieder ein Platz frei – das Dekostück wäre für immer ohne Platz geblieben. Nachgestellt für alle drei Dekostücke. Jetzt bleibt jedem ausstehenden Dekostück ein Platz frei (`placeSpotsFor`, `moveSpotsFor`, `decoNeeds` in `shared/rules.ts`; Begründung in `CLAUDE.md`). Belegt: neue Tests in `shared/rules.test.ts` (kleines Haus mit bekannten Größen; dazu das ganze Kapitel in 40 Häusern mit fünf Arten zu wählen, Dekostück sofort oder erst am Schluss, mit und ohne geheime Gutscheine), 338 Vitest-Tests, der Durchlauf über den Worker achtmal hintereinander grün. Der Test selbst ist unverändert. Ein Haus, das unter den alten Regeln schon eine Platzart gefüllt hat, repariert das nicht – vor dem echten Start beginnt ohnehin jedes Haus neu.

## Phase 5/6 – Inhalte Kapitel 1: abgeschlossen am 2026-11-12

Lief auf dem Modell der Sitzung (Fable 5.2; geplant war Sonnet 5.5). Subagenten: `pruefer` (Opus 5.5) einmal für das Review. `fliessband` lief nicht – die 26 Stücke und 30 Aufgaben entstanden direkt, das war billiger als Aufträge zu verteilen und nachzuprüfen.

**Gebaut und belegt** (Typecheck 0 Fehler, 317 Vitest-Tests, 53 Browser-Tests in WebKit, Produktions-Build und Worker-Bündel):
- **30 Aufgaben** in `content/chapter-1/tasks/`, Reihenfolge in `chapter.json`: 12 Rätsel (je Art Variante 1 in der ersten, Variante 2 in der zweiten Hälfte, Rollen getauscht, beide führen und handeln gleich oft), 10 Fragen (6 Auswahl, 4 frei), 8 Aufgaben im echten Leben (abwechselnd an einen oder beide; a und b je zweimal allein). Nie zweimal hintereinander dieselbe Art. Die zehn Test-Aufgaben `example-*` sind umbenannt und überarbeitet.
- **Katalog:** 45 Stücke (42 im Angebot, 3 Dekostücke), 26 davon neu gezeichnet; für jede Platzart mehr Stücke als Plätze. 12 Stücke mit vietnamesischem Zweitnamen. `content/vi-terms.json` hat 16 Begriffe.
- **Szenen:** die sechs Texte bleiben, drei leicht geändert (keine Szene nennt mehr ein bestimmtes Geschenk).
- **Prüfungen:** `checkComplete` (kein Meilenstein hinter der letzten Aufgabe – Befund W4 aus Phase 4 –, genau eine Szene, Geschenk nie leer) und in `checkContent` die Wortprüfung für Vietnamesisches mitten im Text; beide brechen den Bau ab. `shared/chapter-1.test.ts` hält Umfang und Rollenverteilung von Kapitel 1 fest, `worker/test/chapter.test.ts` spielt alle 30 Aufgaben samt Bauzügen mit zwei Spielern über den lokalen Worker.
- **Reihenfolge-Rätsel:** Die Anfangslage liegt jetzt mindestens drei Handgriffe von der Lösung entfernt (`startOrder`, `MIN_START_MOVES`).
- **Test-Geschirr:** `open-task` gilt Meilensteine auf dem Weg als gesehen (sonst müsste jedes Gerät vor einer späten Aufgabe durch jede Szene); die Bildschirm-Tests kennen zwei Varianten je Rätselart (die Erklärung erscheint nur vor der ersten).

**Review durch `pruefer` (Opus 5.5):** nichts Kritisches. Wichtig: Die Anfangslage von `sequence-1` verriet fast die Lösung (behoben in `startOrder`, mit Test); Szene 15 erzählte die Papierlaterne, die mit einem geheimen Gutschein gar nicht kommt (umgeschrieben). Klein: `sequence-2` war nur länger, nicht schwerer (Hinweise verlangen jetzt Schlussfolgern); der Text von `reallife-toast` passte nicht zum Knopf "It arrived" (jetzt wird ein Toast geschickt); drei Wandstücke hingen zu hoch (nach unten gerückt); `checkComplete` meldete kein Dekostück an einem Meilenstein mit festem Gutschein (ergänzt, mit Test); ein Hinweis in `map-legend-1` war überflüssig (jetzt braucht es alle drei). Die Korrekturen hat `pruefer` nicht noch einmal gelesen.

**Nicht belegt:**
- Kein Mensch außer der KI und `pruefer` hat die Texte und Rätselhinweise gelesen; die vietnamesischen Begriffe sind ungeprüft.
- Auf den iPhones ist von Phase 5 nichts zu sehen (nicht hochgeladen). Dort läuft Phase 4 mit einem Haus, das `example-split-code` schon gelöst hat – dieselbe Aufgabe käme nach dem Hochladen als `split-code-1` noch einmal. Vor dem echten Start beginnt ohnehin jedes Haus neu (siehe Phase 4).
- Während der Phase liefen auf dem Rechner Testläufe anderer Projekte; unter dieser Last und bei zwei eigenen Läufen gleichzeitig scheiterten Browser-Tests an Zeitgrenzen. Belegt ist der eine Lauf allein: 53 von 53 in 3,0 Minuten.

**Für die Optik-Phase notiert (dort erledigt):** Der Titel "The spice rack, just so" passt nicht ganz zum Text der Rätselart ("how the shelf should look").

## Phase 4/6 – Aufgaben und Rätsel: abgeschlossen am 2026-11-12

Lief auf Fable 5.2 statt Opus 5.5. Subagenten: fünf `builder` (Sonnet 5.5) für die Rätsel-Bausteine MapLegend, DescribeArrange, SpotDifference, Sequence, BlindMaze samt Treibern – zwei davon brach das Nutzungslimit beim Abschlussbericht ab, ihre Dateien waren fertig; `pruefer` (Opus 5.5) zweimal: Review der Phase, danach Review der Korrekturen. `explorer` und `zusammenfasser` wurden nicht gebraucht.

**Gebaut und belegt** (Typecheck 0 Fehler, 284 Vitest-Tests, 46 Browser-Tests in WebKit, Produktions-Build läuft):
- Regeln (`shared/rules.ts`): Tagesablauf `advance`, `puzzle.solve`, `knowme.submit`, `knowme.judge`, `reallife.confirm`, `announceTask`; jede erledigte Aufgabe läuft über `finishTask` → `completeTask` (Bauzug, Meilenstein).
- Sechs Rätselarten: Logik in `shared/puzzles/`, Schema samt Prüfung "widerspruchsfrei, lösbar, nicht ohne Partner lösbar", Bausteine in `src/screens/today/puzzles/`, Erklärung je Art vor dem ersten Start, Treiber in `e2e/puzzle-drivers/`. Zehn Test-Aufgaben in `content/chapter-1/tasks/` (je Rätselart eine, zwei Fragen, zwei Aufgaben im echten Leben).
- Worker: `advance` bei jedem Abgleich, Cron `0 6 * * *` für "neue Aufgabe", stellbare Uhr nur mit `TEST_CLOCK=1`. `TEST_ACTIONS`, der Test-Knopf und `HouseView.testActions` sind entfernt; `test.completeTask` wird immer abgelehnt.
- Oberfläche: Today mit Rätsel-Hülle, Kennst-du-mich, Aufdecken mit Herz und Entscheidung, Aufgabe im echten Leben; Punkt am Reiter; Zwischenstand einer Aufgabe in den Geräte-Einstellungen.
- Akzeptanz P4-01 bis P4-07: in `tests.json` auf `passed`, mit Fundstellen.
- Gefundene und behobene Fehler während des Baus: Zwei Einstellungsänderungen kurz nacheinander überschrieben sich (`SyncEngine.updateSettings`, mit Test). Der Test-Handgriff `openTask` übersah eine Meilenstein-Szene, die erst mit dem Abgleich kam (nur im Test, unter Last).

**Review durch `pruefer` (Opus 5.5) am 2026-11-12 über `20d1d4c..7c4893b`:** nichts Kritisches; vier wichtige und sechs kleine Befunde. Was daraus wurde (Commits `3002dd2`, `61357f5` und folgende):
- **W1 – Karte und Legende war allein lösbar: behoben.** Gesucht sind jetzt mehrere Verstecke auf einmal (`treasures`), geprüft wird nur die ganze Auswahl; ein einzelnes Versteck verrät nichts (Treiber prüft das). Jede Variante jeder der sechs Arten muss mindestens 50 verschiedene Eingaben zulassen (`MIN_ATTEMPTS`, vorsichtig gezählt); Reihenfolge braucht damit fünf Schritte, Zwei Bilder acht Felder. Die Inhaltsprüfung lehnt Zeichen ab, deren Name in ihrer Bedeutung steht; die Test-Variante hat neutrale Zeichen und einen Titel, der nichts verrät. "Fehlversuche unbegrenzt und ohne Strafe" gilt unverändert.
- **W2 – verwaiste Aufgabe blockierte das Haus: behoben.** `upcomingTask` richtet sich nach den erledigten ids; eine offene Aufgabe, die die Inhalte nicht mehr kennen (oder nur in anderer Art), macht in `advance` sofort der nächsten Platz. Fünf Tests in `shared/tasks.test.ts` ("Tagesablauf, wenn sich die Inhalte ändern"), die am alten Code scheitern.
- **W3 – Altstände ohne `judged`: behoben.** `upgradeState` (`shared/stored-state.ts`) ergänzt das Feld bei jedem Laden; belegt in Vitest und gegen den Worker mit einem Stand, wie Phase 3 ihn schrieb. Die App verkraftet auch eine alte gespeicherte Sicht (`src/lib/tasks.ts`). Die echte Datenbank muss dafür nicht mehr geleert werden.
- **W4 – Meilensteine jenseits der Aufgabenzahl: nicht im Code geändert, Phase 5 zugewiesen.** Das ist eine Frage der Vollständigkeit: Kapitel 1 hat bis Phase 5 nur zehn Test-Aufgaben, eine Prüfung "kein Meilenstein hinter der letzten Aufgabe" bräche jetzt den Bau ab, und eine Sonderregel in den Spielregeln wäre mit vollständigen Inhalten toter Code. Die Prüfung gehört zu P5-02 (dort vermerkt). Folge bis dahin, falls vorher hochgeladen wird: Nach zehn Aufgaben sagt Today "That was the last one", die Gutscheine an 20 und 30 bleiben verhüllt, ein danach hinterlegter geheimer Gutschein wartet an Meilenstein 15. Sobald Phase 5 die 30 Aufgaben bringt, spielt dasselbe Haus weiter (W2) und erreicht sie.
- **K1, K2: als Setzung in `CLAUDE.md`** (Cron-Lauf für rund acht Häuser mit Mitteilungen und ohne Merker gegen doppelte; keine "neue Aufgabe" beim Nachrücken). **K3 behoben:** Grundriss höchstens 6 Spalten, neuer Browser-Test aller Rätsel bei 375 px Breite. **K4 behoben:** Getipptes wird bei jedem Zeichen gesichert (Browser-Test mit Neuladen, scheitert am alten Code). **K5 behoben:** Der Test verlangt für jedes Gerät genau "rejected". **K6 behoben:** Der Treiber prüft, dass bei Rolle 2 kein Schritt auf der Karte steht.

**Nach-Review durch `pruefer` (Opus 5.5) am 2026-11-12 über `779edde..61357f5`:** W2, W3 und K1 bis K6 als erledigt bestätigt; keine gelöschten oder abgeschwächten Tests. W4 wertet er als "nicht behoben" – die Zuweisung an Phase 5 trage nur, solange das beim Hochladen bedacht wird (siehe unten). Nachbefunde, alle eingearbeitet:
- Die Mindestzahl möglicher Eingaben prüften nur drei der sechs Arten. Jetzt alle sechs, vorsichtig gezählt: Geteilter Code – Symbole je Stelle ohne die, die die Regel selbst nennt; Beschreiben und Anordnen – Auswahl der gebrauchten Teile mal ihre Plätze; Wegweiser – Wege ohne Blick auf die Wände bis zur Länge des richtigen; Zwei Bilder – zwei Unterschiede bis zur Hälfte der Felder. Tests je Art in `shared/puzzles/puzzles.test.ts`.
- Erledigte Test-Aufgaben zählen für Bauzug und Meilensteine weiter mit: als Bedingung für den echten Start festgehalten (unten und in `CLAUDE.md`).
- Die Test-Karte war so regelmäßig angelegt (je zwei Verstecke an jedem Eckzeichen), dass sich die Auswahl ohne Legende eingrenzen ließ: neu angelegt. Die Ausnahme von der Tagesregel beim Ersetzen einer verwaisten Aufgabe steht jetzt in `CLAUDE.md`.
- Ein drittes Review fand nicht statt; die Nachbesserungen sind durch Tests belegt.

**Live seit 2026-11-12** (Commit `7947867`, Workflow-Lauf 43277756855 grün: Typecheck, alle Tests, Build, Worker, Pages; keine neue Migration). Mit Phase 4 allein hat das Kapitel zehn Test-Aufgaben (siehe W4) – gut zum Ausprobieren auf den iPhones, nicht zum echten Spielen. In WebKit von der Live-Adresse aus nennt die Versionszeile `7947867`; zwei Geräte haben sich gekoppelt, beide bekamen `example-split-code`, Rolle 1 löste, beide sahen "1 of 10 tasks done", danach A "Your pick" und B "Ada picks next"; der Test-Knopf ist weg. Das Protokoll des Worker-Deploys nennt `schedule: 0 6 * * *`; die stellbare Uhr (`TEST_CLOCK`) steht nicht in `wrangler.jsonc`.

**Bedingung für den echten Start (nach Phase 5/6):** Jedes Haus beginnt neu. Erledigte Test-Aufgaben bleiben im Stand und zählen für Bauzug und Meilensteine weiter mit; mit den 30 echten Aufgaben fiele Meilenstein 30 sonst schon auf etwa die zwanzigste. Also die echte Datenbank mit Zustimmung des Nutzers leeren (dort liegen auch drei Probehäuser aus den Abnahmen) – die App bietet danach auf den iPhones "Start over" an.

**Nicht belegt:**
- Auf den iPhones (vom Nutzer gemeldet am 2026-11-12): Update angekommen, beide gekoppelt, die erste Aufgabe (Geteilter Code) zu zweit gelöst – "sonst hat es funktioniert". Einziger Mangel: Die offene App zeigte den Schritt des anderen erst nach Schließen und Öffnen; daraus der Knopf "Refresh" (siehe unten). Nicht gemeldet: die übrigen fünf Rätselarten mit dem Finger, Lesbarkeit der Symbole, die Mitteilung am Morgen.
- Der Cron-Trigger ist bei Cloudflare eingetragen (Protokoll des Deploys); dass er morgens läuft und die Mitteilung ankommt, ist nur lokal über das Test-Geschirr belegt.
- Ob die Hinweise der Test-Rätsel für Menschen gut verständlich sind, hat niemand außer der KI beurteilt; die echten Varianten kommen in Phase 5.

## Zwischenwunsch nach Phase 4: "Refresh" in der Kopfleiste (2026-11-12)

Der Nutzer meldete von den iPhones: Hat der andere etwas getan, musste man die App schließen und neu öffnen, um es zu sehen. Gebaut wie von ihm vorgeschlagen: ein Knopf oben neben den Einstellungen (nur mit Haus), der den Stand holt (`src/components/TopBar.svelte`, ruft `syncNow`). Das Symbol dreht sich mindestens 0,7 s und wird blasser (bleibt sichtbar, wenn Bewegung abgeschaltet ist); ohne Netz sagt der Streifen darunter, woran es liegt. Keine Änderung am Worker oder an der Schnittstelle.

Belegt: Typecheck 0 Fehler, 284 Vitest-Tests, 47 Browser-Tests in WebKit – neu `e2e/sync.spec.ts`, '"Refresh" in der Kopfleiste holt den Schritt des anderen, ohne dass die App verlassen wird' –, Produktions-Build, Bildschirmfoto `screenshots/07-today.png` angesehen. Lokal committet. Der Nutzer hat entschieden: hochgeladen wird er erst zusammen mit Phase 5. Auf dem iPhone noch nicht geprüft.

## Phase 3/6 – Haus und Gutscheine: abgeschlossen am 2026-11-12

Lief auf Fable 5.2 statt Sonnet 5.5. Subagenten: `builder` (Sonnet 5.5) für `src/lib/sound.ts`, `fliessband` (Haiku 5.5) für 18 Platzhalter-Stücke und 5 Platzhalter-Szenen, `pruefer` (Opus 5.5) für das Review. `explorer` wurde nicht gebraucht.

**Gebaut und belegt** (Typecheck grün, 187 Vitest-Tests, 29 Playwright-Tests in WebKit):
- Regeln in `shared/rules.ts`: `completeTask` (zählt die Aufgabe, legt den Bauzug an, öffnet am Meilenstein das Geschenk), `build.choose`, `build.place`, `piece.move`, `milestone.seen`, `coupon.requestRedeem`, `coupon.confirmRedeem`. Bauzüge laufen einer nach dem anderen; ein Zug bekommt sein Angebot erst, wenn er dran ist.
- Test-Aufgaben: Aktion `test.completeTask`, nur wenn der Worker `TEST_ACTIONS=1` hat. Lokal und in den Tests an; seit 2026-11-12 auf Wunsch des Nutzers auch im Betrieb (`worker/wrangler.jsonc`), damit sich der Bauzug auf den iPhones ausprobieren lässt. Entfällt mit Phase 4.
- Inhalte: Wohnzimmer, Küche, Garten mit 34 Plätzen (wall 8, surface 9, floor 6, ground 8, fence 3); 16 Platzhalter-Stücke plus 3 Dekostücke (Meilensteine 5, 15, 25); 6 Platzhalter-Szenen. Schema: Platz mit `size`, Raum mit `outdoor`.
- Oberfläche: Kopfleiste mit Einstellungs-Symbol, untere Leiste (Home, Today, Gifts) mit Punkt, wenn etwas wartet; `src/screens/` mit Haus und Bauzug, Erinnerungsstücken unter dem Dach, Meilenstein-Szene mit Geschenk, Gifts mit Einlösen, Einstellungen mit Ton-Schalter. Today zeigt bis Phase 4 nur den Stand (und, mit Test-Aktionen, den Knopf "Finish a test task").
- Ton über WebAudio (`src/lib/sound.ts`, `audio.ts`): Platzieren, Lösen, Enthüllen; abschaltbar.
- iPhone-Hülle: 13 Startbilder je Gerätegröße (`scripts/splash-sizes.ts`, `scripts/gen-assets.ts`), Verweise über `vite.config.ts`; nicht im Precache.

**Review durch `pruefer` (Opus 5.5) am 2026-11-12:** nichts Kritisches oder Wichtiges; Geheimhaltung, Rollen, Verträglichkeit mit den installierten Apps, Test-Aktionen und die geänderten älteren Tests ohne Befund. Drei kleine Befunde, alle behoben:
- Ein Bauzug hätte hängen bleiben können, wenn mehrere offene Züge um den letzten Platz einer Art konkurrieren (mit den Platzhaltern nicht auslösbar, mit dem echten Katalog schon). Jetzt läuft immer nur ein Zug, und Umstellen darf ihm nicht den letzten Platz nehmen.
- Das Mitlesen der Server-Antworten in den Browser-Tests konnte die letzte Antwort verpassen; es wartet jetzt, bis jede gelesen ist.
- Geschenk mit Dekostück, Karte fürs Dekostück, volles Haus und Querformat mit seitlichen Rändern waren nicht vermessen; `e2e/screens.spec.ts` deckt sie jetzt ab (35 Zustände).
- Die Behebungen hat `pruefer` nicht noch einmal gesehen; belegt sind sie durch die Tests.

**Setzungen** (Begründung in `CLAUDE.md`): Das Dekostück stellt auf, wer zuerst kommt. Nach dem letzten Meilenstein ist das Hinterlegen geschlossen. Wer eine Aktion selbst auslöst, bekommt dazu keine Mitteilung; beim Wählen im Bauzug geht "partner_done" an den anderen.

**Live seit 2026-11-12** (Commit `d0189a1`, Workflow-Lauf 43222721648 grün: Build mit allen Tests, Worker, Pages): In WebKit von der Live-Adresse aus nennt die Versionszeile `d0189a1`; zwei Geräte haben sich gekoppelt, "Finish a test task" zählte "1 of 30", danach sah A "Your pick" und B "… picks next". In der echten Datenbank liegen damit zwei Probehäuser aus den Abnahmen; die iPhones des Nutzers waren bis dahin noch nicht gekoppelt.

**Nicht belegt oder offen:**
1. Auf den echten iPhones ist von dieser Phase nichts geprüft: Darstellung unter Uhr und Dynamic Island, Startbild, Klang (der Test-Browser hat kein Audio – geprüft ist nur der Weg von der Geste bis zum Ton).
2. Der Nutzer hat am 2026-11-12 entschieden: hochladen mit Test-Knopf (`"TEST_ACTIONS": "1"` in `worker/wrangler.jsonc`). Was damit auf den iPhones entsteht, sind Probestände.
3. Ein Browser-Testlauf scheiterte gleich zu Beginn mit zehn Tests im 30-Sekunden-Zeitlimit (der Browser kam nicht hoch); der Lauf davor und der danach waren mit 29 von 29 grün. Die Ursache ist nicht ermittelt, vermutlich ein Hänger des Rechners. Tritt es im Workflow auf: Lauf wiederholen und dann nachsehen.
4. P2-11 (Probe-Mitteilung auf dem iPhone) ist weiter unbestätigt – der Nutzer hat sie laut Auskunft vom 2026-11-12 noch nicht ausprobiert.
5. Vor jedem weiteren Push fragen – er löst auf beiden iPhones einen Update-Hinweis aus.

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

## Wünsche des Nutzers vom 2026-11-12 (während Phase 5)

- **Optik – eigene Phase nach Phase 5, vor der Abnahme:** "Da muss grafisch/visuell DEUTLICH mehr drin sein", "Baue mehr Tiefe ein", "Mach die App visuell beeindruckend", ausdrücklich mit Zeit dafür. Das hebt die Vorgabe "flächig, keine Verläufe" aus `CLAUDE.md` auf: Tiefe (Licht, Schatten, Schichten, Bewegung) ist jetzt gewollt. Betrifft Räume, alle 45 Stücke, Haus-Ansicht, Karten und Übergänge. Erst eine Probe (ein Raum, einige Stücke, ein Bildschirm) als Bild an den Nutzer, dann ausrollen. Grenzen bleiben: alles als SVG und CSS, keine Rasterbilder, keine externen Quellen, Kontrast AA, Tap-Ziele 44 px, `prefers-reduced-motion`, keine Farbe als Informationsträger in Rätseln.
- **Erweiterbarkeit – wichtig für später, jetzt nichts verbauen:** Nach den 30 Tagen soll es weitergehen können, etwa ein Urlaub an einem anderen Ort (Insel) oder eine größere Villa mit 90 statt 30 Tagen – ohne dass das alte Haus und die Erinnerungen verloren gehen. Was dafür schon steht: Inhalte liegen je Kapitel als Dateien (`content/chapter-N/`), die Regeln lesen das Kapitel über `chapterOf` aus dem Stand, der Server hält den ganzen Stand, `upgradeState` bringt Altstände auf eine neue Form, die App aktualisiert sich selbst. Mehr Aufgaben, Plätze und Stücke im selben Haus brauchen nur Inhaltsdateien. Was für einen zweiten Ort fehlt (nicht in diesem Projektumfang – "Kapitel 2" ist Nicht-Ziel): Der Stand kennt genau ein Kapitel (`HouseState.chapter`; `done`, `placements`, `buildTurns`, `milestones` ohne Kapitelbezug). Ein neuer Ort braucht den Stand je Kapitel, eine Regel für den Übergang und in der App den Wechsel zwischen den Orten; der alte Ort bleibt dabei unverändert liegen und ansehbar. Regel bis dahin: keine neue Annahme "es gibt nur Kapitel 1" in Regeln oder Oberfläche, ids bleiben über Kapitel hinweg eindeutig.

## Offene Punkte für spätere Phasen

- **Neue Rätselvarianten:** Was eine Variante einhalten muss, prüft der Bau (mindestens 50 mögliche Eingaben, Grundriss höchstens 6 Spalten, Zeichen ohne Bezug zur Bedeutung). Ob frei formulierte Hinweise eindeutig und verständlich sind, kann nur ein Mensch bzw. `pruefer` beurteilen. Der Zeichenvorrat hat 16 Symbole (`shared/puzzles/tiles.ts`); mehr brauchen eine Zeichnung in `src/components/Glyph.svelte`.
- **Texte:** Fragen, Aufgaben, Szenen und Stücknamen sind fertig, aber von keinem Menschen gelesen.
- **Kapitelende:** Nach der letzten Aufgabe zeigt Today "That was the last one"; mit 30 Aufgaben fällt das mit Meilenstein 30 zusammen. Ob das als Abschluss des Kapitels genügt, entscheidet die Abnahme.
- **Vietnamesische Begriffe** in `content/vi-terms.json` sind ungeprüft, bis die Frau des Nutzers die Liste gesehen hat.
- `npm audit` meldet 7 Hinweise (niedrig/mittel) in Build-Werkzeugen (glob, minimatch, deepmerge unter workbox-build). Sie laufen nur beim Bauen und stecken nicht in der App; `npm audit fix --force` würde Pakete auf alte Hauptversionen zurücksetzen und bleibt deshalb aus.

## Ideen außerhalb des Umfangs

- Abendpalette (Indigo, Laternengelb) als zweites Farbschema.
- Die offene App aktualisiert sich von selbst, sobald die Mitteilung über den Schritt des anderen eintrifft (der Service Worker sagt es der offenen Seite, die gleicht ab). Braucht erlaubte Mitteilungen und berührt "keine Echtzeit-Anzeige" – nur, wenn der Nutzer es will; bis dahin gibt es "Refresh".
- Kursive Fraunces für die vietnamesischen Zweitnamen (bräuchte die Kursiv-Schriftdateien im Precache).
