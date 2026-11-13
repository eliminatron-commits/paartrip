// Einstellungen: Der Ton lässt sich abschalten, die Wahl bleibt erhalten und wirkt.
import { readFileSync } from 'node:fs';
import { expect, type Page, test } from '@playwright/test';
import type { Content } from '../shared/content-schema.ts';
import { otherSlot } from '../shared/model.ts';
import type { PuzzleData } from '../shared/puzzles/index.ts';
import { canSolve, type PuzzleKind } from '../shared/puzzles/kinds.ts';
import { receiversOf } from '../shared/rules.ts';
import { closePhones, closeSettings, openSettings, openTab, openTask, pair, phone } from './phones.ts';
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

/**
 * Hält fest, welche Lieder die Seite holt und wie viele Quellen gerade klingen. Wie beim Ton steht an Stelle
 * des AudioContext ein Zähler mit derselben Schnittstelle; geprüft wird der Weg von Geste und Bildschirm bis
 * zum Lied, nicht der Klang.
 */
async function recordMusic(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const scope = window as unknown as { AudioContext: unknown; music: { fetched: string[]; started: number; playing: number } };
    scope.music = { fetched: [], started: 0, playing: 0 };
    const realFetch = window.fetch.bind(window);
    window.fetch = (input, init) => {
      const url = input instanceof Request ? input.url : String(input);
      if (url.includes('/music/')) scope.music.fetched.push(url.split('/music/')[1]!);
      return realFetch(input, init);
    };
    const param = () => ({ value: 0, setValueAtTime() {}, linearRampToValueAtTime() {}, cancelScheduledValues() {} });
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
        return { type: 'sine', frequency: param(), connect() {}, start() {}, stop() {} };
      }
      createGain() {
        return { gain: param(), connect() {} };
      }
      createBufferSource() {
        return {
          buffer: null,
          loop: false,
          connect() {},
          start() {
            scope.music.started += 1;
            scope.music.playing += 1;
          },
          stop() {
            scope.music.playing -= 1;
          },
        };
      }
      decodeAudioData() {
        return Promise.resolve({ duration: 120 });
      }
    };
  });
}
const music = (page: Page) =>
  page.evaluate(() => (window as unknown as { music: { fetched: string[]; started: number; playing: number } }).music);

test('Musik: an als Voreinstellung, startet erst mit dem ersten Tippen, bei den Aufgaben ein anderes Lied, abgeschaltet still', async ({ browser }) => {
  const { a } = await pair(browser);
  const { page } = a;
  await recordMusic(page);
  await page.reload();
  await expect(page.getByTestId('house-names')).toBeVisible();
  // Ohne Geste erlaubt iOS keinen Ton – und die App versucht es auch nicht.
  expect((await music(page)).started).toBe(0);

  // Erstes Tippen im Haus: Tag- oder Abendlied, je nach Uhrzeit des Geräts.
  await page.getByTestId('house-names').click();
  await expect.poll(async () => (await music(page)).playing).toBe(1);
  expect((await music(page)).fetched).toEqual([expect.stringMatching(/^(day|night)\.m4a$/)]);

  // Bei den Aufgaben: "Everyday Pulse"; das Lied des Hauses wird ausgeblendet.
  await openTab(page, 'Today');
  await expect.poll(async () => (await music(page)).fetched).toContain('pulse.m4a');
  await expect.poll(async () => (await music(page)).started).toBe(2);
  await expect.poll(async () => (await music(page)).playing).toBe(1);

  // Abschalten blendet aus und bleibt nach dem Neuladen aus.
  await openSettings(page);
  const toggle = page.getByRole('switch', { name: 'Music' });
  await expect(toggle).toHaveAttribute('aria-checked', 'true');
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-checked', 'false');
  await expect.poll(async () => (await music(page)).playing).toBe(0);

  await page.reload();
  await openSettings(page);
  await expect(page.getByRole('switch', { name: 'Music' })).toHaveAttribute('aria-checked', 'false');
  await closeSettings(page);
  await page.getByRole('button', { name: 'Home' }).click();
  await page.getByTestId('house-names').click();
  // Ein Moment für einen Start, der nicht kommen darf.
  await page.waitForTimeout(500);
  expect((await music(page)).started).toBe(0);
});
