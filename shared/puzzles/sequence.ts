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

/** So viele Schritte muss man aus der Anfangslage mindestens herausnehmen und woanders einfügen, um zu lösen. */
export const MIN_START_MOVES = 3;

/**
 * Wie viele Schritte man mindestens herausnehmen und woanders einfügen muss, damit die Reihenfolge stimmt:
 * alle außer der längsten Folge von Schritten, die schon richtig zueinander stehen.
 */
export function movesToSolve(order: SequenceAttempt): number {
  const longest: number[] = [];
  order.forEach((step, place) => {
    longest[place] = 1 + Math.max(0, ...order.slice(0, place).map((earlier, at) => (earlier < step ? (longest[at] ?? 0) : 0)));
  });
  return order.length - Math.max(0, ...longest);
}

/**
 * Die Reihenfolge, in der Rolle 1 die Schritte zu Beginn sieht: fest durch den Wortlaut der Schritte
 * bestimmt (kein Zufall, also auf jedem Gerät und nach jedem Neustart gleich) und weit weg von der Lösung –
 * kein Schritt steht an seinem Platz, und mit ein, zwei Handgriffen ist es nicht getan. Sonst ließe sich das
 * Rätsel aus der Anfangslage heraus allein lösen.
 */
export function startOrder(data: SequenceData): SequenceAttempt {
  const mixed = (salt: number) =>
    data.steps.map((_, index) => index).sort((x, y) => hash(`${salt}:${data.steps[x] ?? ''}`) - hash(`${salt}:${data.steps[y] ?? ''}`) || x - y);
  const far = (order: SequenceAttempt) => order.every((step, place) => step !== place) && movesToSolve(order) >= Math.min(MIN_START_MOVES, order.length - 1);
  // Anders gemischt, bis es passt. Bei den verlangten fünf und mehr Schritten findet sich das nach wenigen Anläufen.
  for (let salt = 0; salt < 500; salt++) {
    const order = mixed(salt);
    if (far(order)) return order;
  }
  // Nur bei sehr kurzen Listen (die die Inhaltsprüfung ohnehin ablehnt): rückwärts ist nie die Lösung.
  return data.steps.map((_, index) => index).reverse();
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
