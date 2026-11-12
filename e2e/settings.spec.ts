// Einstellungen: Der Ton lässt sich abschalten, die Wahl bleibt erhalten und wirkt.
import { expect, type Page, test } from '@playwright/test';
import { closePhones, closeSettings, finishTestTask, openSettings, pair, phone } from './phones.ts';

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
  const { a } = await pair(browser);
  await countTones(a.page);
  await a.page.reload();
  await expect(a.page.getByTestId('house-names')).toHaveText('Ada & Bao');

  // Ton an (Voreinstellung): Die Test-Aufgabe klingt.
  await finishTestTask(a.page);
  await expect.poll(() => tones(a.page)).toBeGreaterThan(0);

  // Ton aus: Es kommt nichts mehr dazu.
  await openSettings(a.page);
  await a.page.getByRole('switch', { name: 'Sound' }).click();
  await expect(a.page.getByRole('switch', { name: 'Sound' })).toHaveAttribute('aria-checked', 'false');
  await closeSettings(a.page);
  const before = await tones(a.page);
  await finishTestTask(a.page);
  expect(await tones(a.page)).toBe(before);

  // Wieder an: Schon das Einschalten gibt eine Kostprobe.
  await openSettings(a.page);
  await a.page.getByRole('switch', { name: 'Sound' }).click();
  await expect.poll(() => tones(a.page)).toBeGreaterThan(before);
});
