// Die Logik aller Rätselarten an einer Stelle: Daten prüfen, Lösung nennen, einen Versuch prüfen.
// Reine Funktionen ohne Oberfläche – die App prüft damit die Eingabe auf dem Gerät des Handelnden,
// die Inhaltsprüfung jede Variante beim Bauen, und Tests spielen jede Variante durch.
import * as blindMaze from './blind-maze.ts';
import * as describeArrange from './describe-arrange.ts';
import type { PuzzleKind } from './kinds.ts';
import * as mapLegend from './map-legend.ts';
import * as sequence from './sequence.ts';
import * as splitCode from './split-code.ts';
import * as spotDifference from './spot-difference.ts';

export interface PuzzleData {
  'map-legend': mapLegend.MapLegendData;
  'split-code': splitCode.SplitCodeData;
  'describe-arrange': describeArrange.DescribeArrangeData;
  'spot-difference': spotDifference.SpotDifferenceData;
  sequence: sequence.SequenceData;
  'blind-maze': blindMaze.BlindMazeData;
}

export interface PuzzleAttempt {
  'map-legend': mapLegend.MapLegendAttempt;
  'split-code': splitCode.SplitCodeAttempt;
  'describe-arrange': describeArrange.DescribeArrangeAttempt;
  'spot-difference': spotDifference.SpotDifferenceAttempt;
  sequence: sequence.SequenceAttempt;
  'blind-maze': blindMaze.BlindMazeAttempt;
}

export interface PuzzleLogic<Data, Attempt> {
  /** Probleme der Daten (leer = in Ordnung): Widersprüche, und was das Rätsel ohne Partner lösbar machte. */
  validate(data: Data): string[];
  solution(data: Data): Attempt;
  isSolved(data: Data, attempt: Attempt): boolean;
}

export const PUZZLE_LOGIC: { [K in PuzzleKind]: PuzzleLogic<PuzzleData[K], PuzzleAttempt[K]> } = {
  'map-legend': mapLegend,
  'split-code': splitCode,
  'describe-arrange': describeArrange,
  'spot-difference': spotDifference,
  sequence,
  'blind-maze': blindMaze,
};
