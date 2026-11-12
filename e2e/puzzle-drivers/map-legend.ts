// Platzhalter – der Treiber folgt mit dem Baustein.
import type { PuzzleDriver } from './driver.ts';

const missing = (): never => {
  throw new Error('Treiber für map-legend fehlt noch');
};

export const driver: PuzzleDriver<'map-legend'> = {
  expectHalf: () => Promise.resolve(missing()),
  tryWrong: () => Promise.resolve(missing()),
  solve: () => Promise.resolve(missing()),
};
