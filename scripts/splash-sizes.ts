// Startbilder für das iPhone: iOS zeigt beim Öffnen einer Home-Bildschirm-App nur dann ein eigenes Bild
// statt einer weißen Fläche, wenn es zu genau dieser Gerätegröße eines gibt.
// Eine Liste für beide Stellen: scripts/gen-assets.ts erzeugt die Bilder, vite.config.ts die Verweise.
//
// Breite und Höhe in CSS-Pixeln (Hochformat) und die Pixeldichte. Alle iPhones, auf denen iOS 16.4 läuft.

export interface SplashScreen {
  width: number;
  height: number;
  ratio: number;
  devices: string;
}

export const SPLASH_SCREENS: SplashScreen[] = [
  { width: 375, height: 667, ratio: 2, devices: 'iPhone 8, SE (2. und 3. Generation)' },
  { width: 414, height: 736, ratio: 3, devices: 'iPhone 8 Plus' },
  { width: 375, height: 812, ratio: 3, devices: 'iPhone X, XS, 11 Pro' },
  { width: 414, height: 896, ratio: 2, devices: 'iPhone XR, 11' },
  { width: 414, height: 896, ratio: 3, devices: 'iPhone XS Max, 11 Pro Max' },
  { width: 360, height: 780, ratio: 3, devices: 'iPhone 12 mini, 13 mini' },
  { width: 390, height: 844, ratio: 3, devices: 'iPhone 12, 12 Pro, 13, 13 Pro, 14, 16e' },
  { width: 428, height: 926, ratio: 3, devices: 'iPhone 12 Pro Max, 13 Pro Max, 14 Plus' },
  { width: 393, height: 852, ratio: 3, devices: 'iPhone 14 Pro, 15, 15 Pro, 16' },
  { width: 430, height: 932, ratio: 3, devices: 'iPhone 14 Pro Max, 15 Plus, 15 Pro Max, 16 Plus' },
  { width: 402, height: 874, ratio: 3, devices: 'iPhone 16 Pro, 17, 17 Pro' },
  { width: 420, height: 912, ratio: 3, devices: 'iPhone Air' },
  { width: 440, height: 956, ratio: 3, devices: 'iPhone 16 Pro Max, 17 Pro Max' },
];

/** Größe des Bildes in Gerätepixeln. */
export function splashPixels(screen: SplashScreen): { width: number; height: number } {
  return { width: screen.width * screen.ratio, height: screen.height * screen.ratio };
}

/** Pfad unterhalb von public/ bzw. der App-Adresse. */
export function splashFile(screen: SplashScreen): string {
  const { width, height } = splashPixels(screen);
  return `splash/${width}x${height}.png`;
}

/** Bedingung, unter der iOS genau dieses Bild nimmt. */
export function splashMedia(screen: SplashScreen): string {
  return `screen and (device-width: ${screen.width}px) and (device-height: ${screen.height}px) and (-webkit-device-pixel-ratio: ${screen.ratio}) and (orientation: portrait)`;
}
