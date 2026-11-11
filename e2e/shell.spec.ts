import { expect, test } from '@playwright/test';

test('die App startet und zeigt Namen, Kapitel und Versionszeile', async ({ page }) => {
  await page.goto('./');
  await expect(page).toHaveTitle('Nhà Mình – PaarTrip');
  await expect(page.getByRole('heading', { level: 1, name: 'Nhà Mình' })).toBeVisible();
  // Kapiteltitel kommt aus content/ – belegt den Weg von der Inhaltsdatei bis in die App.
  await expect(page.getByText('Dọn về nhà mới')).toBeVisible();
  await expect(page.getByTestId('version-line')).toHaveText(/^Version \d+\.\d+\.\d+ · \d{4}-\d{2}-\d{2} \d{2}:\d{2} · e2e0001$/);
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
