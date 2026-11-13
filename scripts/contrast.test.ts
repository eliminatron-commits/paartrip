// Kontrast der Farb-Tokens nach WCAG 2.1 (AA): Text mindestens 4,5:1, Bedienelemente und Zeichen 3:1.
// Die Werte kommen aus src/app.css; geprüft wird jede Kombination, die die Oberfläche verwendet.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const css = readFileSync('src/app.css', 'utf8');

function token(name: string): string {
  const value = new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})\\b`).exec(css)?.[1];
  if (!value) throw new Error(`Token --${name} fehlt in src/app.css`);
  return value;
}

/** Relative Leuchtdichte nach WCAG. */
function luminance(hex: string): number {
  const channel = (offset: number) => {
    const value = parseInt(hex.slice(offset, offset + 2), 16) / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);
}

function contrast(foreground: string, background: string): number {
  const [light, dark] = [luminance(token(foreground)), luminance(token(background))].sort((x, y) => y - x) as [number, number];
  return (light + 0.05) / (dark + 0.05);
}

// Schrift auf Fläche, so wie die Oberfläche sie setzt.
const TEXT: [foreground: string, background: string, where: string][] = [
  ['ink', 'cream', 'Fließtext'],
  ['ink', 'cream-deep', 'Fließtext auf Flächen und Karten'],
  ['ink', 'wall', 'Hinweis in der leeren Galerie'],
  ['ink-soft', 'cream', 'Hinweise'],
  ['ink-soft', 'cream-deep', 'Hinweise auf Flächen, Reiter der unteren Leiste'],
  ['petrol', 'cream', 'Titel, Umriss-Knöpfe'],
  ['petrol', 'cream-deep', 'Titel und Umriss-Knöpfe auf Flächen'],
  ['terracotta', 'cream', 'Zweitnamen, Fehlermeldungen, aktiver Reiter'],
  ['terracotta', 'cream-deep', 'Zweitnamen und Fehlermeldungen auf Flächen'],
  ['sage-deep', 'cream', 'Überzeilen'],
  ['sage-deep', 'cream-deep', 'Überzeilen auf Flächen'],
  ['cream', 'terracotta', 'Knöpfe'],
  ['cream', 'petrol', 'Kopfleiste, Update-Hinweis'],
  ['cream-deep', 'petrol', 'Unterzeile der Kopfleiste'],
  ['cream', 'sage-deep', 'erreichte Meilensteine'],
  ['cream', 'dusk', 'Namen auf dem Abendhimmel (Home), unteres Ende des Verlaufs'],
  ['cream-deep', 'dusk', 'Überzeile und Stand auf dem Abendhimmel'],
  ['lantern', 'dusk', 'Zweitname auf dem Abendhimmel'],
  ['lantern', 'petrol', 'Zweitname auf dem Abendhimmel, oberes Ende des Verlaufs'],
  ['ink', 'lantern', 'Zahl in einer leuchtenden Laterne'],
];

// Zeichen und Teile von Bedienelementen, die ohne Schrift erkennbar sein müssen.
const SHAPES: [foreground: string, background: string, where: string][] = [
  ['ink-soft', 'cream-deep', 'Schalter aus, Rand der Eingabefelder'],
  ['sage-deep', 'cream-deep', 'Schalter an, Rahmen der Meilenstein-Marken'],
  ['cream', 'ink-soft', 'Knopf des Schalters (aus)'],
  ['petrol', 'cream', 'Fokusrahmen, Auswahlrahmen, leuchtender Platz'],
  ['terracotta', 'cream-deep', 'Punkt an der unteren Leiste, verhülltes Geschenk'],
  ['wood', 'wall', 'Bilderrahmen an der Galeriewand'],
  ['cream', 'wood', 'Notiz im Bilderrahmen'],
  ['cream-deep', 'dusk', 'Umriss einer Laterne, die noch nicht leuchtet'],
];

describe('Kontrast der Farb-Tokens', () => {
  it.each(TEXT)('Text %s auf %s (%s) erreicht 4,5:1', (foreground, background) => {
    expect(contrast(foreground, background)).toBeGreaterThanOrEqual(4.5);
  });

  it.each(SHAPES)('Zeichen %s auf %s (%s) erreicht 3:1', (foreground, background) => {
    expect(contrast(foreground, background)).toBeGreaterThanOrEqual(3);
  });
});

describe('Farben im Code', () => {
  function sources(dir: string): string[] {
    return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) return sources(path);
      return /\.(svelte|css)$/.test(entry.name) ? [path] : [];
    });
  }
  const files = sources('src').map((path) => ({ path, text: readFileSync(path, 'utf8') }));
  /** Nur die Gestaltung: der <style>-Block einer Komponente bzw. die ganze CSS-Datei. */
  const styles = files.map(({ path, text }) => ({ path, style: path.endsWith('.css') ? text : (/<style>([\s\S]*)<\/style>/.exec(text)?.[1] ?? '') }));

  it('die reinen Dekor-Töne stehen nirgends als Schriftfarbe', () => {
    const misuse = styles.filter(({ style }) => /(^|[\s;{])color:\s*var\(--(terracotta-soft|sage|wood|mauve|afterglow)\)/.test(style)).map(({ path }) => path);
    expect(misuse).toEqual([]);
  });

  it('Komponenten nutzen die Tokens statt eigener Farbwerte', () => {
    const own = styles.filter(({ path, style }) => !path.endsWith('app.css') && /#[0-9a-fA-F]{3,8}\b/.test(style)).map(({ path }) => path);
    expect(own).toEqual([]);
  });
});
