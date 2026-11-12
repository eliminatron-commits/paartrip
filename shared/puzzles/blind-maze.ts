// Wegweiser. Rolle 1 sieht das Labyrinth und sagt den Weg an. Rolle 2 steuert blind: Sie sieht nur das leere
// Raster mit Start und Ziel und ihre eigene Spur – keine Wände, und auch kein Anstoßen. Erst am Ziel zeigt
// sich, ob der Weg durch eine Wand ging; dann geht es zurück zum Start. So verrät Herumprobieren nichts.
//
// Das Labyrinth ist ein Raster aus Zeichen, eine Zeile je Reihe: '#' Wand · '.' Weg · 'S' Start · 'G' Ziel

import { MIN_ATTEMPTS } from './tiles.ts';

export interface BlindMazeData {
  maze: string[];
}

export type Move = 'up' | 'down' | 'left' | 'right';
export const MOVES: Move[] = ['up', 'right', 'down', 'left'];

/** Der Weg als Folge von Schritten ab dem Start. */
export type BlindMazeAttempt = Move[];

export interface Cell {
  row: number;
  col: number;
}

const STEP: Record<Move, Cell> = { up: { row: -1, col: 0 }, down: { row: 1, col: 0 }, left: { row: 0, col: -1 }, right: { row: 0, col: 1 } };

export function mazeSize(data: BlindMazeData): { rows: number; cols: number } {
  return { rows: data.maze.length, cols: data.maze[0]?.length ?? 0 };
}

function find(data: BlindMazeData, char: string): Cell | null {
  for (let row = 0; row < data.maze.length; row++) {
    const col = (data.maze[row] ?? '').indexOf(char);
    if (col >= 0) return { row, col };
  }
  return null;
}

export function startCell(data: BlindMazeData): Cell {
  return find(data, 'S') ?? { row: 0, col: 0 };
}

export function goalCell(data: BlindMazeData): Cell {
  return find(data, 'G') ?? { row: 0, col: 0 };
}

const inside = (data: BlindMazeData, cell: Cell) => (data.maze[cell.row]?.[cell.col] ?? '') !== '';
const isWall = (data: BlindMazeData, cell: Cell) => data.maze[cell.row]?.[cell.col] === '#';

/** Das Feld nach einem Schritt; null, wenn er aus dem Raster führen würde (den Rand sieht auch Rolle 2). */
export function stepFrom(data: BlindMazeData, cell: Cell, move: Move): Cell | null {
  const next = { row: cell.row + STEP[move].row, col: cell.col + STEP[move].col };
  return inside(data, next) ? next : null;
}

export interface Walk {
  /** Alle betretenen Felder, das Startfeld zuerst. */
  path: Cell[];
  /** Kein betretenes Feld war eine Wand. */
  clean: boolean;
  atGoal: boolean;
}

/** Geht die Schritte ab, ohne an Wänden anzuhalten. Schritte über den Rand hinaus fallen weg. */
export function walk(data: BlindMazeData, moves: Move[]): Walk {
  const path = [startCell(data)];
  for (const move of moves) {
    const next = stepFrom(data, path[path.length - 1] ?? startCell(data), move);
    if (next) path.push(next);
  }
  const last = path[path.length - 1] ?? startCell(data);
  const goal = goalCell(data);
  return { path, clean: path.every((cell) => !isWall(data, cell)), atGoal: last.row === goal.row && last.col === goal.col };
}

/** Kürzester Weg vom Start zum Ziel; null, wenn es keinen gibt. */
export function shortestPath(data: BlindMazeData): Move[] | null {
  const start = startCell(data);
  const goal = goalCell(data);
  const key = (cell: Cell) => `${cell.row},${cell.col}`;
  const routes = new Map<string, Move[]>([[key(start), []]]);
  const queue: Cell[] = [start];
  for (let cell = queue.shift(); cell; cell = queue.shift()) {
    const route = routes.get(key(cell)) ?? [];
    if (cell.row === goal.row && cell.col === goal.col) return route;
    for (const move of MOVES) {
      const next = stepFrom(data, cell, move);
      if (!next || isWall(data, next) || routes.has(key(next))) continue;
      routes.set(key(next), [...route, move]);
      queue.push(next);
    }
  }
  return null;
}

export function validate(data: BlindMazeData): string[] {
  const problems: string[] = [];
  const width = data.maze[0]?.length ?? 0;
  if (data.maze.some((line) => line.length !== width)) problems.push('maze: die Zeilen sind nicht gleich lang');
  const chars = data.maze.flatMap((line) => [...line]);
  for (const char of new Set(chars)) if (!'#.SG'.includes(char)) problems.push(`maze: unbekanntes Zeichen "${char}"`);
  for (const char of ['S', 'G']) {
    const count = chars.filter((c) => c === char).length;
    if (count !== 1) problems.push(`maze: genau ein "${char}", gefunden ${count}`);
  }
  if (problems.length > 0) return problems;

  const route = shortestPath(data);
  if (!route) return ['maze: vom Start führt kein Weg zum Ziel'];
  // Führt der gerade Weg (erst waagerecht, dann senkrecht oder umgekehrt) ohne Wand zum Ziel, braucht es Rolle 1 nicht.
  const start = startCell(data);
  const goal = goalCell(data);
  const across: Move[] = Array.from({ length: Math.abs(goal.col - start.col) }, () => (goal.col > start.col ? 'right' : 'left'));
  const along: Move[] = Array.from({ length: Math.abs(goal.row - start.row) }, () => (goal.row > start.row ? 'down' : 'up'));
  if (walk(data, [...across, ...along]).clean || walk(data, [...along, ...across]).clean) {
    problems.push('maze: der gerade Weg zum Ziel ist frei – ohne Partner lösbar');
  }
  const possible = blindRoutes(data, route.length, MIN_ATTEMPTS);
  if (possible < MIN_ATTEMPTS) {
    problems.push(`maze: bis zur Länge des richtigen Wegs (${route.length} Schritte) gibt es nur ${possible} Wege zum Ziel – mindestens ${MIN_ATTEMPTS}, sonst genügt Probieren`);
  }
  return problems;
}

/**
 * Wie viele Wege Rolle 2 durchprobieren müsste, vom kürzesten an: Wege vom Start zum Ziel, die kein Feld zweimal
 * betreten und höchstens `limit` Schritte lang sind. Wände zählen dabei nicht – Rolle 2 sieht sie nicht.
 * Gezählt wird nur bis `enough`; mehr braucht die Prüfung nicht zu wissen.
 */
function blindRoutes(data: BlindMazeData, limit: number, enough: number): number {
  const goal = goalCell(data);
  const key = (cell: Cell) => `${cell.row},${cell.col}`;
  const walked = new Set<string>();
  let count = 0;
  const visit = (cell: Cell, left: number): void => {
    if (count >= enough) return;
    if (cell.row === goal.row && cell.col === goal.col) {
      count += 1;
      return;
    }
    // Von hier aus ist das Ziel mit den übrigen Schritten nicht mehr zu erreichen.
    if (Math.abs(goal.row - cell.row) + Math.abs(goal.col - cell.col) > left) return;
    walked.add(key(cell));
    for (const move of MOVES) {
      const next = stepFrom(data, cell, move);
      if (next && !walked.has(key(next))) visit(next, left - 1);
    }
    walked.delete(key(cell));
  };
  visit(startCell(data), limit);
  return count;
}

export function solution(data: BlindMazeData): BlindMazeAttempt {
  const route = shortestPath(data);
  if (!route) throw new Error('Labyrinth ohne Weg');
  return route;
}

export function isSolved(data: BlindMazeData, attempt: BlindMazeAttempt): boolean {
  const result = walk(data, attempt);
  return result.atGoal && result.clean;
}
