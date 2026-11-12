// Texte der sechs Rätselarten: Name, die Idee in einem Satz und was jede Rolle tut. Sie gehören zum Baustein
// der Rätselart, nicht zu einer einzelnen Variante – deshalb stehen sie hier und nicht unter content/.
// Der Erklärbildschirm vor dem ersten Start und die Zeile über dem Rätsel zeigen dieselben Sätze.
import type { PuzzleKind, PuzzleRole } from '../../../shared/puzzles/kinds.ts';

export interface PuzzleTexts {
  name: string;
  /** Worum es geht – für beide gleich. */
  idea: string;
  /** Was dieser Spieler tut; `partner` ist der Vorname des anderen. */
  role: Record<PuzzleRole, (partner: string) => string>;
}

const both = (text: (partner: string) => string): PuzzleTexts['role'] => ({ lead: text, partner: text });

export const PUZZLE_TEXTS: Record<PuzzleKind, PuzzleTexts> = {
  'map-legend': {
    name: 'Map and legend',
    idea: 'Something is hidden in a room. One of you has the floor plan, the other one the legend and the clues.',
    role: {
      lead: (p) => `You see the floor plan, but not what the symbols stand for. ${p} has the legend and the clues. Describe what you see, then tap the hiding place.`,
      partner: (p) => `You have the legend and the clues. ${p} sees the floor plan and taps the hiding place. Ask what is where, and lead the way.`,
    },
  },
  'split-code': {
    name: 'Split code',
    idea: 'A lock opens with a few symbols in the right order. One of you has the rules, the other one the row of symbols they point to.',
    role: {
      lead: (p) => `You have the lock and one rule for each place of the code. The rules point into a row of symbols that only ${p} can see. Ask, then enter the code.`,
      partner: (p) => `You see the row of symbols. ${p} has the lock and the rules. Tell ${p} whatever they need to know about your row.`,
    },
  },
  'describe-arrange': {
    name: 'Describe and arrange',
    idea: 'A shelf has to be arranged just so. One of you sees how it should look, the other one has the pieces.',
    role: {
      lead: (p) => `You see how the shelf should look. Describe it to ${p}, who puts the pieces in place.`,
      partner: (p) => `You have an empty shelf and a tray of pieces. ${p} sees how it should look. Place what ${p} describes – not every piece is needed.`,
    },
  },
  'spot-difference': {
    name: 'Spot the difference',
    idea: 'You both look at the same shelf – almost. On your two phones, a few squares are not the same.',
    role: both((p) => `Compare your shelf with ${p}'s, square by square, and mark every square that differs. It is enough if one of you gets them all.`),
  },
  sequence: {
    name: 'In the right order',
    idea: 'A few steps belong in a certain order. One of you has the steps, the other one the hints.',
    role: {
      lead: (p) => `You have the steps, all mixed up. ${p} has hints about the order. Sort them together.`,
      partner: (p) => `You have hints about the right order. ${p} has the steps and sorts them. Read your hints out loud.`,
    },
  },
  'blind-maze': {
    name: 'Blind maze',
    idea: 'A way leads through a maze. One of you sees the walls, the other one does the walking.',
    role: {
      lead: (p) => `You see the maze. ${p} walks it without seeing a single wall. Give directions from the start to the door.`,
      partner: (p) => `You walk, but you see no walls – only your own trail. ${p} sees the maze and tells you the way. If you crossed a wall, you find out at the door.`,
    },
  },
};
