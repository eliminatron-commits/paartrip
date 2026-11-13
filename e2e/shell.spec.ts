import { expect, test } from '@playwright/test';
import { closeSettings, motions, openSettings, recordMotion } from './phones.ts';

test('die App startet und zeigt Namen und Versionszeile', async ({ page }) => {
  await page.goto('./');
  await expect(page).toHaveTitle('Nhà Mình – PaarTrip');
  await expect(page.getByRole('heading', { level: 1, name: 'Nhà Mình' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Welcome home' })).toBeVisible();
  // Die Versionszeile steht in den Einstellungen – erreichbar, auch bevor ein Haus existiert.
  // (Dass Inhalte aus content/ in der App ankommen, belegt e2e/house.spec.ts am Kapiteltitel und an den Räumen.)
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await expect(page.getByTestId('version-line')).toHaveText(/^Version \d+\.\d+\.\d+ · \d{4}-\d{2}-\d{2} \d{2}:\d{2} · e2e0001$/);
});

test('ein neuer Bildschirm blendet auf – beim Start und mit "Bewegung reduzieren" steht er sofort da', async ({ page }) => {
  await recordMotion(page);
  const moved = async () => (await motions(page)).filter((motion) => motion.screen);

  await page.goto('./');
  await expect(page.getByRole('heading', { name: 'Welcome home' })).toBeVisible();
  expect(await moved()).toEqual([]);

  await openSettings(page);
  await expect.poll(moved).not.toEqual([]);

  await page.emulateMedia({ reducedMotion: 'reduce' });
  const before = (await moved()).length;
  await closeSettings(page);
  await expect(page.getByRole('heading', { name: 'Welcome home' })).toBeVisible();
  expect(await moved()).toHaveLength(before);
});

test('ist installierbar: Manifest, Icons und iOS-Angaben stimmen', async ({ page, request }) => {
  await page.goto('./');

  const manifestUrl = new URL((await page.locator('link[rel="manifest"]').getAttribute('href')) ?? '', page.url());
  const manifest = (await (await request.get(manifestUrl.href)).json()) as {
    icons: { src: string; purpose?: string }[];
  };
  expect(manifest).toMatchObject({
    name: 'Nhà Mình – PaarTrip',
    short_name: 'PaarTrip',
    display: 'standalone',
    orientation: 'portrait',
    start_url: '/paartrip/',
    scope: '/paartrip/',
  });
  expect(manifest.icons.some((icon) => icon.purpose === 'maskable')).toBe(true);
  for (const icon of manifest.icons) {
    const response = await request.get(new URL(icon.src, manifestUrl).href);
    expect(response.headers()['content-type'], icon.src).toBe('image/png');
  }

  const touchIcon = (await page.locator('link[rel="apple-touch-icon"]').getAttribute('href')) ?? '';
  expect((await request.get(new URL(touchIcon, page.url()).href)).headers()['content-type']).toBe('image/png');
  await expect(page.locator('meta[name="viewport"]')).toHaveAttribute('content', /viewport-fit=cover/);
  // black-translucent brachte unter iOS 26/27 einen Schleier oben und einen Streifen unten (siehe index.html).
  await expect(page.locator('meta[name="apple-mobile-web-app-status-bar-style"]')).toHaveAttribute('content', 'default');
});

test('die Kopfleiste ist einfarbig und haftet am oberen Rand – so setzt iOS die Statusleiste in ihrer Farbe fort', async ({ page }) => {
  await page.goto('./');
  const bar = page.locator('header.top');
  await expect(bar).toHaveCSS('position', 'sticky');
  await expect(bar).toHaveCSS('background-image', 'none');
  expect(await bar.evaluate((el) => el.getBoundingClientRect().top)).toBe(0);
  // Undurchsichtig: ohne Alpha unter 1.
  expect(await bar.evaluate((el) => getComputedStyle(el).backgroundColor)).toMatch(/^rgb\(/);
});

test('lädt nichts von fremden Adressen (Schriften sind lokal eingebunden)', async ({ page, baseURL }) => {
  const origin = new URL(baseURL ?? '').origin;
  const foreign: string[] = [];
  page.on('request', (request) => {
    if (!request.url().startsWith(origin) && !request.url().startsWith('data:')) foreign.push(request.url());
  });
  await page.goto('./');
  await page.evaluate(() => document.fonts.ready);
  expect(await page.evaluate(() => document.fonts.check('600 20px "Fraunces Variable"'))).toBe(true);
  expect(await page.evaluate(() => document.fonts.check('17px "Nunito Variable"'))).toBe(true);
  expect(foreign).toEqual([]);
});
