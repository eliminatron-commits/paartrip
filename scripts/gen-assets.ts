// Erzeugt die PNG-Icons und die iPhone-Startbilder aus public/icon.svg. iOS und das Manifest verlangen PNG;
// die Quelle bleibt die SVG, die PNGs entstehen bei jedem Build neu und liegen nicht im Repo.
import { mkdir, readFile } from 'node:fs/promises';
import sharp from 'sharp';
import { SPLASH_SCREENS, splashFile, splashPixels } from './splash-sizes.ts';

const SOURCE = 'public/icon.svg';
const OUT_DIR = 'public/icons';

const ICONS: [file: string, size: number][] = [
  ['icon-192.png', 192],
  ['icon-512.png', 512],
  ['icon-maskable-512.png', 512],
  ['apple-touch-icon.png', 180],
];

await mkdir(OUT_DIR, { recursive: true });
for (const [file, size] of ICONS) {
  // Mit doppelter Dichte rastern und herunterrechnen, damit die Kanten sauber bleiben.
  await sharp(SOURCE, { density: 144 }).resize(size, size).png().toFile(`${OUT_DIR}/${file}`);
}
console.log(`Icons erzeugt: ${ICONS.map(([file]) => file).join(', ')}`);

// Startbilder: cremefarbene Fläche (wie die App) mit dem Icon als abgerundeter Kachel, etwas über der Mitte.
// Ohne Schrift, damit das Ergebnis nicht von den Schriften des Rechners abhängt, der baut.
const ICON_SIZE = 512;
const icon = (await readFile(SOURCE, 'utf8')).replace(/^[\s\S]*?<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '');

await mkdir('public/splash', { recursive: true });
for (const screen of SPLASH_SCREENS) {
  const { width, height } = splashPixels(screen);
  const tile = Math.round(width * 0.3);
  const x = Math.round((width - tile) / 2);
  const y = Math.round(height * 0.42 - tile / 2);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
    <rect width="${width}" height="${height}" fill="#FAF3E7"/>
    <clipPath id="tile"><rect width="${ICON_SIZE}" height="${ICON_SIZE}" rx="${ICON_SIZE * 0.22}"/></clipPath>
    <g transform="translate(${x} ${y}) scale(${tile / ICON_SIZE})" clip-path="url(#tile)">${icon}</g>
  </svg>`;
  // Wenige Farben, große Flächen: als Palettenbild bleibt jede Datei klein.
  await sharp(Buffer.from(svg)).png({ palette: true, compressionLevel: 9 }).toFile(`public/${splashFile(screen)}`);
}
console.log(`Startbilder erzeugt: ${SPLASH_SCREENS.length} Größen`);
