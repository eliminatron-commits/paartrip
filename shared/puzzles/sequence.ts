// Reihenfolge. Rolle 1 hat die Schritte, durcheinander, und bringt sie in die richtige Abfolge.
// Rolle 2 hat die Hinweise dazu. In der Datei stehen die Schritte in der richtigen Reihenfolge –
// durcheinandergebracht werden sie erst hier, und zwar jedes Mal gleich.
import { duplicates, MIN_ATTEMPTS } from './tiles.ts';

export interface SequenceData {
  /** Die Schritte in der richtigen Reihenfolge. */
  steps: string[];
  /** Hinweise zur Abfolge, wie Rolle 2 sie vorliest. */
  hints: string[];
}

/** Die Nummern der Schritte (Stellen in `steps`, ab 0) in der gelegten Reihenfolge. */
export type SequenceAttempt = number[];

function hash(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/**
 * Die Reihenfolge, in der Rolle 1 die Schritte zu Beginn sieht: fest durch den Wortlaut der Schritte
 * bestimmt (kein Zufall, also auf jedem Gerät und nach jedem Neustart gleich) und nie schon die Lösung.
 */
export function startOrder(data: SequenceData): SequenceAttempt {
  const order = data.steps.map((_, index) => index).sort((x, y) => hash(data.steps[x] ?? '') - hash(data.steps[y] ?? '') || x - y);
  // Steht zufällig schon alles richtig, rückt der erste Schritt ans Ende.
  if (order.every((step, place) => step === place)) order.push(order.shift() ?? 0);
  return order;
}

/** Wie viele Reihenfolgen es für so viele Schritte gibt. */
function orders(steps: number): number {
  let count = 1;
  for (let i = 2; i <= steps; i++) count *= i;
  return count;
}

export function validate(data: SequenceData): string[] {
  const problems = duplicates(data.steps, (s) => s.trim().toLowerCase()).map((dup) => `steps: "${dup}" doppelt – die Reihenfolge wäre nicht eindeutig`);
  const possible = orders(data.steps.length);
  if (possible < MIN_ATTEMPTS) {
    problems.push(`steps: ${data.steps.length} Schritte lassen nur ${possible} Reihenfolgen zu – mindestens ${MIN_ATTEMPTS}, sonst genügt Probieren`);
  }
  return problems;
}

export function solution(data: SequenceData): SequenceAttempt {
  return data.steps.map((_, index) => index);
}

export function isSolved(data: SequenceData, attempt: SequenceAttempt): boolean {
  return attempt.length === data.steps.length && attempt.every((step, place) => step === place);
}
