// Vorübergehend (Optik-Phase): legt Bilder des Home-Bildschirms mit einem eingerichteten Wohnzimmer ab – für den
// Vorher-Nachher-Vergleich. Die Sicht wird auf dem Gerät ergänzt, bevor die App sie liest (Stücke stehen schon,
// kein Bauzug offen); der Server bleibt unberührt. Über page.route ginge das nicht: Die Anfragen laufen durch
// den Service Worker. Aufruf: PROBE_OUT=<Ordner> npx playwright test e2e/optik-probe.spec.ts
import { mkdir } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { closePhones, finishTask, openTab, pair, returnToApp, SAFE_AREA } from './phones.ts';

test.afterEach(closePhones);

const OUT = process.env.PROBE_OUT ?? 'screenshots/probe';
const PLACED = {
  monstera: 'living-room-floor-1',
  armchair: 'living-room-floor-2',
  sofa: 'living-room-floor-3',
  'floor-lamp': 'living-room-floor-4',
  'framed-picture': 'living-room-wall-3',
  candle: 'living-room-shelf-1',
};

test('Probe: Home mit eingerichtetem Wohnzimmer', async ({ browser }) => {
  test.setTimeout(120_000);
  await mkdir(OUT, { recursive: true });
  const { a } = await pair(browser, { safeArea: SAFE_AREA });
  await a.context.addInitScript((placed) => {
    const original = window.fetch.bind(window);
    window.fetch = async (input, init) => {
      const response = await original(input, init);
      const url = typeof input === 'string' ? input : input instanceof Request ? input.url : String(input);
      if (!url.endsWith('/sync') || !response.ok) return response;
      const body = await response.clone().json();
      if (!body.view) return response;
      body.view.placements = Object.entries(placed).map(([pieceId, spotId]) => ({ pieceId, spotId }));
      for (const turn of body.view.buildTurns) {
        turn.chosen ??= turn.offer[0] ?? 'sofa';
        turn.placedAt ??= 'living-room-floor-1';
      }
      for (const milestone of body.view.milestones) {
        milestone.decoPiece = null;
        milestone.seenBy = ['a', 'b'];
      }
      return new Response(JSON.stringify(body), { status: response.status, headers: response.headers });
    };
  }, PLACED);
  await a.page.reload();
  await expect(a.page.getByTestId('house-names')).toBeVisible();
  for (let done = 0; done < 7; done++) await finishTask(a);
  await returnToApp(a.page);
  await openTab(a.page, 'Home');
  await expect(a.page.locator('[data-piece="sofa"]')).toBeVisible();
  await expect(a.page.getByTestId('milestone')).toHaveCount(0);
  await a.page.evaluate(() => document.fonts.ready);

  await a.page.screenshot({ path: `${OUT}/home-oben.png` });
  await a.page.locator('[data-room="living-room"]').evaluate((room) => room.scrollIntoView({ block: 'center' }));
  await a.page.screenshot({ path: `${OUT}/home-wohnzimmer.png` });
});
