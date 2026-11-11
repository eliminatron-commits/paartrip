import { expect, type Page, test } from '@playwright/test';
import { type StaticServer, startStaticServer } from './static-server.ts';

// Eigener Server auf eigenem Port: Diese Tests stellen einen zweiten Deploy nach, indem sie den
// ausgelieferten Build austauschen. Das darf die anderen Tests nicht treffen.
const PORT = 4174;
let server: StaticServer;

test.describe.configure({ mode: 'serial' });
test.beforeAll(async () => {
  server = await startStaticServer('dist-e2e/v1', PORT);
});
test.afterAll(async () => {
  await server.close();
});
test.beforeEach(() => {
  server.deploy('dist-e2e/v1');
});

/** Lädt die App und wartet, bis der Service Worker die Seite steuert – der Zustand nach der Installation. */
async function openInstalled(page: Page): Promise<void> {
  await page.goto(server.url);
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
}

test('zweiter Deploy: Hinweis erscheint bei Rückkehr in die App, Tippen aktualisiert', async ({ page }) => {
  await openInstalled(page);
  const versionLine = page.getByTestId('version-line');
  const banner = page.getByTestId('update-banner');
  await expect(versionLine).toContainText('e2e0001');
  await expect(banner).toBeHidden();

  server.deploy('dist-e2e/v2');
  // Rückkehr in die App: iOS lädt die Seite nicht neu, es meldet nur visibilitychange.
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));

  await expect(banner).toContainText('New version');
  // Hinweis statt Zwang: ohne Tippen bleibt die alte Version aktiv.
  await expect(versionLine).toContainText('e2e0001');

  await banner.getByRole('button', { name: 'Update' }).click();
  await expect(versionLine).toContainText('e2e0002');
  await expect(banner).toBeHidden();
});

test('"Check for updates" meldet den aktuellen Stand und eine gefundene Version', async ({ page }) => {
  await openInstalled(page);
  const check = page.getByRole('button', { name: 'Check for updates' });
  const result = page.getByTestId('update-result');

  await check.click();
  await expect(result).toHaveText("You're up to date.");
  await expect(page.getByTestId('update-banner')).toBeHidden();

  server.deploy('dist-e2e/v2');
  await check.click();
  await expect(result).toHaveText('New version found.');
  await expect(page.getByTestId('update-banner')).toBeVisible();
});

test('"Check for updates" meldet ohne Netz einen Fehler', async ({ page, context }) => {
  await openInstalled(page);
  await context.setOffline(true);
  await page.getByRole('button', { name: 'Check for updates' }).click();
  await expect(page.getByTestId('update-result')).toHaveText("Couldn't check. Are you offline?");
});
