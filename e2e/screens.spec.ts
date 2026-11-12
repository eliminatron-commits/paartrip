// Jeder Bildschirm bei 440×956 mit den Rändern eines echten iPhones (oben Uhr und Dynamic Island, unten der
// Home-Indikator): Nichts Bedienbares und kein Text liegt in den Rändern, jedes Tap-Ziel ist groß genug.
// Die Screenshots landen in screenshots/ – für die Sichtprüfung.
import { mkdir, readFile } from 'node:fs/promises';
import { expect, type Page, test } from '@playwright/test';
import type { Content } from '../shared/content-schema.ts';
import {
  closePhones,
  closeSettings,
  finishTestTask,
  moveCard,
  openSettings,
  openTab,
  pair,
  phone,
  returnToApp,
  SAFE_AREA,
  startHouse,
  syncStatus,
  wrapGift,
} from './phones.ts';

test.afterEach(closePhones);

const content = JSON.parse(await readFile('generated/content.json', 'utf8')) as Content;
const chapter = content.chapters[0]!;
const fixedAt = new Set(chapter.coupons.map((c) => c.milestone));
const freeMilestone = chapter.milestones.find((m) => !fixedAt.has(m))!;
/** Mindestgröße für Tap-Ziele (--tap in src/app.css). */
const TAP = 44;
const CONTROLS = 'button, a[href], input, textarea, select, [role="radio"], [role="switch"]';

/** Was liegt in den Rändern? Abgetastet wird, was an jedem Punkt tatsächlich oben liegt. */
async function inSafeAreas(page: Page): Promise<string[]> {
  return page.evaluate(
    ({ top, bottom, controls }) => {
      const found = new Set<string>();
      const probe = (y: number, zone: string) => {
        for (let x = 3; x < window.innerWidth; x += 8) {
          const element = document.elementFromPoint(x, y);
          if (!element) continue;
          const hasText = [...element.childNodes].some((node) => node.nodeType === Node.TEXT_NODE && (node.textContent ?? '').trim() !== '');
          if (element.closest(controls) || hasText) {
            found.add(`${zone}: <${element.tagName.toLowerCase()} class="${element.getAttribute('class') ?? ''}"> ${(element.textContent ?? '').trim().slice(0, 40)}`);
          }
        }
      };
      for (let y = 1; y < top; y += 4) probe(y, 'oben');
      for (let y = window.innerHeight - bottom + 1; y < window.innerHeight; y += 4) probe(y, 'unten');
      return [...found];
    },
    { ...SAFE_AREA, controls: CONTROLS },
  );
}

/** Bedienelemente, die kleiner sind als ein Tap-Ziel sein darf. */
async function smallTargets(page: Page): Promise<string[]> {
  return page.evaluate(
    ({ min, controls }) => {
      const small: string[] = [];
      for (const element of document.querySelectorAll<HTMLElement>(controls)) {
        const box = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        // Nicht dargestellt oder nicht antippbar (das unsichtbare Dateifeld hinter dem Knopf "Restore").
        if (box.width === 0 || box.height === 0 || style.visibility === 'hidden' || style.pointerEvents === 'none') continue;
        if (box.width < min - 0.5 || box.height < min - 0.5) {
          small.push(`${Math.round(box.width)}×${Math.round(box.height)} <${element.tagName.toLowerCase()}> ${(element.getAttribute('aria-label') ?? element.textContent ?? '').trim().slice(0, 40)}`);
        }
      }
      return small;
    },
    { min: TAP, controls: CONTROLS },
  );
}

let shot = 0;
/** Screenshot plus die beiden Prüfungen für den Bildschirm, wie er gerade ist. */
async function check(page: Page, name: string): Promise<void> {
  shot += 1;
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: `screenshots/${String(shot).padStart(2, '0')}-${name}.png` });
  expect(await inSafeAreas(page), `${name}: in den Rändern`).toEqual([]);
  expect(await smallTargets(page), `${name}: zu kleine Tap-Ziele`).toEqual([]);
}

/** Rollt den Inhaltsbereich ans Ende. */
const scrollToEnd = (page: Page) => page.locator('main').evaluate((main) => main.scrollTo(0, main.scrollHeight));

test('alle Bildschirme: nichts in den Rändern, Tap-Ziele groß genug', async ({ browser }) => {
  test.setTimeout(120_000);
  await mkdir('screenshots', { recursive: true });
  shot = 0;

  // ---- Vor dem Koppeln
  const solo = await phone(browser, { safeArea: true });
  await check(solo.page, 'welcome');
  await solo.page.getByRole('button', { name: 'I have a code' }).click();
  await check(solo.page, 'welcome-join');
  await openSettings(solo.page);
  await check(solo.page, 'settings-unpaired');
  await closeSettings(solo.page);
  await solo.page.getByRole('button', { name: 'Start our house' }).click();
  await startHouse(solo.page, 'Ada');
  await check(solo.page, 'home-waiting-for-partner');

  // ---- Zu zweit
  const { a, b } = await pair(browser, { safeArea: true });
  const [first, second] = chapter.build.firstChooser === 'a' ? [a, b] : [b, a];
  await check(a.page, 'home-empty-house');
  await scrollToEnd(a.page);
  await check(a.page, 'home-empty-garden');
  await openTab(a.page, 'Today');
  await check(a.page, 'today');
  await openTab(a.page, 'Gifts');
  await check(a.page, 'gifts-start');

  // Bauzug: wählen, warten, platzieren.
  await finishTestTask(a.page);
  await check(a.page, 'today-after-task');
  await openTab(first.page, 'Home');
  await returnToApp(first.page);
  await expect(moveCard(first.page)).toHaveAttribute('data-kind', 'choose');
  await check(first.page, 'home-choose');
  await first.page.getByRole('radio').first().click();
  await check(first.page, 'home-choose-picked');
  await first.page.getByRole('button', { name: /^Choose the / }).click();
  await expect(moveCard(first.page)).toHaveAttribute('data-kind', 'wait-place');
  await check(first.page, 'home-wait-place');

  await openTab(second.page, 'Home');
  await returnToApp(second.page);
  await expect(moveCard(second.page)).toHaveAttribute('data-kind', 'place');
  await check(second.page, 'home-place');
  await second.page.getByRole('button', { name: 'Find a spot' }).click();
  await expect(second.page.locator('button.target').first()).toBeInViewport();
  await check(second.page, 'home-placing');
  await second.page.locator('button.target').first().click();
  await expect(second.page.locator('svg[data-piece]')).toHaveCount(1);
  await second.page.locator('button.piece').first().click();
  await check(second.page, 'home-piece-selected');
  await second.page.getByTestId('piece-bar').getByRole('button', { name: 'Done' }).click();

  // Erinnerungsstück und Meilenstein: so viele Aufgaben, bis das erste freie Geschenk aufgeht.
  await wrapGift(b.page, 'Breakfast in bed, with the good coffee');
  await check(b.page, 'gifts-wrapped-by-me');
  for (let done = 1; done < freeMilestone; done++) await finishTestTask(a.page);
  await check(a.page, 'milestone-scene');
  await a.page.getByRole('button', { name: 'Open the gift' }).click();
  await check(a.page, 'milestone-gift-open');
  await a.page.getByRole('button', { name: 'See your gifts' }).click();
  await check(a.page, 'gifts-unwrapped');
  await a.page.getByRole('button', { name: 'Redeem' }).click();
  await expect(a.page.getByText('You asked to redeem it.')).toBeVisible();
  await check(a.page, 'gifts-redeem-asked');

  await returnToApp(b.page);
  await b.page.getByRole('button', { name: 'Open the gift' }).click();
  await check(b.page, 'milestone-gift-from-me');
  await b.page.getByRole('button', { name: 'Continue' }).click();
  await openTab(b.page, 'Gifts');
  await check(b.page, 'gifts-confirm');
  await scrollToEnd(b.page);
  await check(b.page, 'gifts-form');

  await openTab(a.page, 'Home');
  await expect(a.page.getByTestId('memory').first()).toBeVisible();
  await check(a.page, 'home-with-memories');
  await a.page.getByTestId('memory').first().click();
  await check(a.page, 'memory-sheet');
  await a.page.getByRole('button', { name: 'Close' }).click();

  // ---- Einstellungen und Hinweise
  await openSettings(a.page);
  await check(a.page, 'settings');
  await scrollToEnd(a.page);
  await check(a.page, 'settings-end');
  await closeSettings(a.page);

  await a.page.waitForFunction(() => navigator.serviceWorker.controller !== null);
  await a.context.setOffline(true);
  await returnToApp(a.page);
  await expect(syncStatus(a.page)).toHaveText('Offline. Showing what was saved last.');
  await check(a.page, 'home-offline');
});

test('im Querformat bricht nichts: kein waagerechtes Rollen, alles bleibt erreichbar', async ({ browser }) => {
  const { a } = await pair(browser);
  await a.page.setViewportSize({ width: 956, height: 440 });
  for (const tab of ['Home', 'Today', 'Gifts'] as const) {
    await openTab(a.page, tab);
    const overflow = await a.page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow, tab).toBeLessThanOrEqual(0);
    await expect(a.page.getByRole('navigation', { name: 'Main' })).toBeInViewport();
  }
  await a.page.screenshot({ path: 'screenshots/landscape-gifts.png' });
  await openTab(a.page, 'Home');
  await a.page.screenshot({ path: 'screenshots/landscape-home.png' });
});

test('mit "Bewegung reduzieren" pulsieren die leuchtenden Plätze nicht', async ({ browser }) => {
  const { a, b } = await pair(browser);
  const placer = chapter.build.firstChooser === 'a' ? b : a;
  const chooser = placer === a ? b : a;
  await finishTestTask(a.page);
  await openTab(chooser.page, 'Home');
  await returnToApp(chooser.page);
  await chooser.page.getByRole('radio').first().click();
  await chooser.page.getByRole('button', { name: /^Choose the / }).click();
  await expect(moveCard(chooser.page)).toHaveAttribute('data-kind', 'wait-place');

  const duration = () => placer.page.locator('button.target .glow').first().evaluate((glow) => parseFloat(getComputedStyle(glow).animationDuration));
  await openTab(placer.page, 'Home');
  await returnToApp(placer.page);
  await placer.page.getByRole('button', { name: 'Find a spot' }).click();
  // Ohne die Einstellung läuft die Animation …
  expect(await duration()).toBeGreaterThan(0.5);
  // … mit ihr praktisch nicht mehr.
  await placer.page.emulateMedia({ reducedMotion: 'reduce' });
  expect(await duration()).toBeLessThan(0.001);
});
