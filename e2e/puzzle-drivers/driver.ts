// Was der Zwei-Geräte-Test von jeder Rätselart wissen muss, um sie über die Oberfläche zu spielen.
// Je Art eine Datei in diesem Ordner; e2e/puzzles.spec.ts spielt damit jede Variante der Inhalte durch.
// Erwartungen leiten sich aus den Rätseldaten und der Logik in shared/puzzles/ ab – nichts ist fest verdrahtet.
import type { Page } from '@playwright/test';
import type { PuzzleData } from '../../shared/puzzles/index.ts';
import type { PuzzleKind, PuzzleRole } from '../../shared/puzzles/kinds.ts';

export interface PuzzleDriver<K extends PuzzleKind> {
  /**
   * Prüft, dass diese Seite genau die Hälfte ihrer Rolle zeigt – und nichts von dem, was nur die andere
   * Rolle sehen darf.
   */
  expectHalf(page: Page, role: PuzzleRole, data: PuzzleData[K]): Promise<void>;
  /**
   * Gibt auf der Seite eines Handelnden einen falschen Versuch ein. Danach muss `puzzle-feedback` etwas
   * melden; das Rätsel bleibt offen.
   */
  tryWrong(page: Page, data: PuzzleData[K]): Promise<void>;
  /** Gibt auf der Seite eines Handelnden die Lösung ein – auch wenn vorher schon etwas Falsches eingegeben war. */
  solve(page: Page, data: PuzzleData[K]): Promise<void>;
}
