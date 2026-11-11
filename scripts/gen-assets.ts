// Erzeugt die PNG-Icons aus public/icon.svg. iOS und das Manifest verlangen PNG;
// die Quelle bleibt die SVG, die PNGs entstehen bei jedem Build neu und liegen nicht im Repo.
import { mkdir } from 'node:fs/promises';
import sharp from 'sharp';

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
