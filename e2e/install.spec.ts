// iPhone-Hülle: Startbilder je Gerätegröße und der Precache, mit dem die App ohne Netz startet.
// (Manifest, Icons und viewport-fit prüft e2e/shell.spec.ts, den Start ohne Netz e2e/house.spec.ts.)
import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import type { Content } from '../shared/content-schema.ts';

/** Breite und Höhe aus dem Kopf einer PNG-Datei (IHDR). */
function pngSize(file: Buffer): { width: number; height: number } {
  expect(file.subarray(1, 4).toString('latin1')).toBe('PNG');
  return { width: file.readUInt32BE(16), height: file.readUInt32BE(20) };
}

test('Startbilder: je iPhone-Größe ein Bild in genau deren Pixelmaß', async ({ page, request }) => {
  await page.goto('./');
  const links = await page.locator('link[rel="apple-touch-startup-image"]').evaluateAll((elements) =>
    elements.map((element) => ({
      media: element.getAttribute('media') ?? '',
      href: (element as HTMLLinkElement).href,
      applies: window.matchMedia(element.getAttribute('media') ?? '').matches,
    })),
  );
  // Von den kleinen Geräten mit Home-Taste bis zu den größten: mindestens ein Dutzend Größen.
  expect(links.length).toBeGreaterThanOrEqual(12);
  expect(new Set(links.map((link) => link.media)).size).toBe(links.length);

  for (const link of links) {
    const [, width, height, ratio] = /device-width: (\d+)px\) and \(device-height: (\d+)px\) and \(-webkit-device-pixel-ratio: (\d)\)/.exec(link.media) ?? [];
    expect(width, link.media).toBeDefined();
    expect(link.media).toContain('(orientation: portrait)');
    expect(new URL(link.href).pathname).toMatch(/^\/paartrip\/splash\//);

    const response = await request.get(link.href);
    expect(response.headers()['content-type'], link.href).toBe('image/png');
    // iOS nimmt ein Startbild nur, wenn es exakt so groß ist wie der Bildschirm in Gerätepixeln.
    expect(pngSize(await response.body()), link.media).toEqual({ width: Number(width) * Number(ratio), height: Number(height) * Number(ratio) });
  }

  // Für das Gerät dieses Tests greift genau eines.
  expect(links.filter((link) => link.applies)).toHaveLength(1);
});

test('Precache: App-Hülle, Schriften und Inhalte liegen bereit – die Startbilder nicht', async ({ page, request }) => {
  await page.goto('./');
  const at = (path: string) => new URL(path, page.url()).href;
  const worker = await (await request.get(at('sw.js'))).text();
  const urls = [...worker.matchAll(/"url":\s*"([^"]+)"/g)].map((match) => match[1] ?? '');

  // Hülle: Seite, Gestaltung, Skript, Manifest, Icons.
  expect(urls).toContain('index.html');
  expect(urls).toContain('manifest.webmanifest');
  expect(urls.some((url) => url.endsWith('.css'))).toBe(true);
  expect(urls.some((url) => url.startsWith('icons/'))).toBe(true);
  const scripts = urls.filter((url) => url.endsWith('.js'));
  expect(scripts.length).toBeGreaterThan(0);

  // Schriften: beide Familien, auch die Zeichen für das Vietnamesische.
  for (const family of ['fraunces', 'nunito']) {
    for (const subset of ['latin', 'vietnamese']) {
      expect(urls.some((url) => new RegExp(`${family}-${subset}-[^/]*\\.woff2$`).test(url)), `${family} ${subset}`).toBe(true);
    }
  }

  // Startbilder holt iOS beim Ablegen auf dem Home-Bildschirm; der Service Worker lädt sich nicht selbst.
  expect(urls.filter((url) => url.startsWith('splash/'))).toEqual([]);
  expect(urls).not.toContain('sw.js');

  // Jede Datei der Liste gibt es wirklich.
  for (const url of new Set(urls)) expect((await request.get(at(url))).status(), url).toBe(200);

  // Inhalte: Räume, Stücke, Aufgaben und Szenen stecken im Skript der App – kein Nachladen zur Laufzeit.
  const code = (await Promise.all(scripts.map(async (url) => (await request.get(at(url))).text()))).join('\n');
  const content = JSON.parse(await readFile('generated/content.json', 'utf8')) as Content;
  for (const chapter of content.chapters) {
    const ids = [...chapter.rooms, ...chapter.pieces, ...chapter.tasks, ...chapter.story].map((entry) => entry.id);
    expect(ids.length).toBeGreaterThan(0);
    // Als ganze Zeichenkette: "kitchen" zählt nicht schon, weil es in "kitchen-counter-1" steckt.
    // Welche Anführungszeichen der Bundler setzt (", ', ` oder \" in JSON-Text), ist ihm überlassen.
    const quote = '[\\\\"\'`]';
    expect(ids.filter((id) => !new RegExp(`${quote}${id}${quote}`).test(code))).toEqual([]);
  }
});
