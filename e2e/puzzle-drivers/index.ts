// Die Treiber aller Rätselarten für e2e/puzzles.spec.ts.
import type { PuzzleKind } from '../../shared/puzzles/kinds.ts';
import { driver as blindMaze } from './blind-maze.ts';
import { driver as describeArrange } from './describe-arrange.ts';
import type { PuzzleDriver } from './driver.ts';
import { driver as mapLegend } from './map-legend.ts';
import { driver as sequence } from './sequence.ts';
import { driver as splitCode } from './split-code.ts';
import { driver as spotDifference } from './spot-difference.ts';

export const DRIVERS: { [K in PuzzleKind]: PuzzleDriver<K> } = {
  'map-legend': mapLegend,
  'split-code': splitCode,
  'describe-arrange': describeArrange,
  'spot-difference': spotDifference,
  sequence,
  'blind-maze': blindMaze,
};
