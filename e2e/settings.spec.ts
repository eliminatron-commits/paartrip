// Einstellungen: Der Ton lässt sich abschalten, die Wahl bleibt erhalten und wirkt.
import { readFileSync } from 'node:fs';
import { expect, type Page, test } from '@playwright/test';
import type { Content } from '../shared/content-schema.ts';
import { otherSlot } from '../shared/model.ts';
import type { PuzzleData } from '../shared/puzzles/index.ts';
import { canSolve, type PuzzleKind } from '../shared/puzzles/kinds.ts';
import { receiversOf } from '../shared/rules.ts';
import { closePhones, closeSettings, openSettings, openTask, pair, phone } from './phones.ts';
import type { PuzzleDriver } from './puzzle-drivers/driver.ts';
import { DRIVERS } from './puzzle-drivers/index.ts';

const chapter = (JSON.parse(readFileSync('generated/content.json', 'utf8')) as Content).chapters[0]!;

test.afterEach(closePhones);

/**
 * Zählt, wie viele Töne die Seite über WebAudio anlegt – so lässt sich "es klingt" ohne Lautsprecher prüfen.
 * Der Test-Browser hat kein Audio (der Konstruktor von AudioContext wirft dort); deshalb steht an seiner
 * Stelle ein Zähler mit derselben Schnittstelle. Geprüft wird damit der Weg von der Geste bis zum Ton,
 * nicht der Klang selbst.
 */
async function countTones(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const scope = window as unknown as { AudioContext: unknown; tones: number };
    scope.tones = 0;
    const param = { value: 0, setValueAtTime() {}, linearRampToValueAtTime() {} };
    scope.AudioContext = class {
      state = 'suspended';
      currentTime = 0;
      destination = {};
      resume() {
        this.state = 'running';
        return Promise.resolve();
      }
      close() {
        this.state = 'closed';
        return Promise.resolve();
      }
      createOscillator() {
        scope.tones += 1;
        return { type: 'sine', frequency: param, connect() {}, start() {}, stop() {} };
      }
      createGain() {
        return { gain: param, connect() {} };
      }
    };
  });
}
const tones = (page: Page) => page.evaluate(() => (window as unknown as { tones: number }).tones);

test('der Ton ist an, lässt sich abschalten und bleibt nach dem Neuladen aus', async ({ browser }) => {
  const solo = await phone(browser);
  await openSettings(solo.page);
  const sound = solo.page.getByRole('switch', { name: 'Sound' });
  await expect(sound).toHaveAttribute('aria-checked', 'true');
  await expect(sound).toContainText('On');

  await sound.click();
  await expect(sound).toHaveAttribute('aria-checked', 'false');
  await expect(sound).toContainText('Off');

  await solo.page.reload();
  await openSettings(solo.page);
  await expect(solo.page.getByRole('switch', { name: 'Sound' })).toHaveAttribute('aria-checked', 'false');
});

test('eingeschaltet erklingt beim Lösen ein Klang, ausgeschaltet nicht', async ({ browser }) => {
  // Das erste Rätsel der Inhalte – und eine Aufgabe im echten Leben, die derselbe Spieler bestätigt.
  const puzzle = chapter.tasks.find((task) => task.type === 'puzzle');
  if (!puzzle || puzzle.type !== 'puzzle') throw new Error('Inhalte ohne Rätsel');
  const solverSlot = canSolve(puzzle.kind, 'lead') ? puzzle.lead : otherSlot(puzzle.lead);
  const errand = chapter.tasks.find((task) => task.type === 'reallife' && receiversOf(task).includes(solverSlot));
  if (!errand) throw new Error('Inhalte ohne passende Aufgabe im echten Leben');

  const { a, b } = await pair(browser);
  const solver = solverSlot === 'a' ? a : b;
  const { page } = solver;
  await countTones(page);
  await page.reload();
  await expect(page.getByTestId('house-names')).toBeVisible();

  // Ton an (Voreinstellung): Das gelöste Rätsel klingt.
  await openTask([a, b], puzzle.id);
  await page.getByRole('button', { name: 'Got it' }).click();
  await (DRIVERS[puzzle.kind] as PuzzleDriver<PuzzleKind>).solve(page, puzzle.data as PuzzleData[PuzzleKind]);
  await expect(page.getByTestId('task-done')).toBeVisible();
  await expect.poll(() => tones(page)).toBeGreaterThan(0);

  // Ton aus: Auch eine Bestätigung, die sonst klingt, bleibt still.
  await openSettings(page);
  await page.getByRole('switch', { name: 'Sound' }).click();
  await expect(page.getByRole('switch', { name: 'Sound' })).toHaveAttribute('aria-checked', 'false');
  await closeSettings(page);
  const before = await tones(page);
  await openTask([a, b], errand.id);
  await page.getByRole('button', { name: 'It arrived' }).click();
  await expect(page.getByRole('button', { name: 'It arrived' })).toHaveCount(0);
  expect(await tones(page)).toBe(before);

  // Wieder an: Schon das Einschalten gibt eine Kostprobe.
  await openSettings(page);
  await page.getByRole('switch', { name: 'Sound' }).click();
  await expect.poll(() => tones(page)).toBeGreaterThan(before);
});
