// Wegweiser über die Oberfläche: Rolle 1 sieht das Labyrinth, Rolle 2 steuert blind durchs leere Raster.
import { expect, type Page } from '@playwright/test';
import { type BlindMazeData, goalCell, mazeSize, type Move, solution, startCell, walk } from '../../shared/puzzles/blind-maze.ts';
import type { PuzzleDriver } from './driver.ts';

async function restart(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Back to start' }).click();
}

async function go(page: Page, moves: Move[]): Promise<void> {
  for (const move of moves) await page.locator(`[data-move="${move}"]`).click();
}

/** Der gerade Weg zum Ziel: erst waagerecht, dann senkrecht (oder umgekehrt). */
function straight(data: BlindMazeData): { across: Move[]; along: Move[] } {
  const start = startCell(data);
  const goal = goalCell(data);
  return {
    across: Array.from({ length: Math.abs(goal.col - start.col) }, () => (goal.col > start.col ? 'right' : 'left')),
    along: Array.from({ length: Math.abs(goal.row - start.row) }, () => (goal.row > start.row ? 'down' : 'up')),
  };
}

async function expectAtStart(page: Page, data: BlindMazeData): Promise<void> {
  const start = startCell(data);
  await expect(page.locator('[data-here="true"]')).toHaveCount(1);
  await expect(page.locator('[data-here="true"]')).toHaveAttribute('data-cell', `${start.row},${start.col}`);
}

export const driver: PuzzleDriver<'blind-maze'> = {
  async expectHalf(page, role, data: BlindMazeData) {
    const { rows, cols } = mazeSize(data);
    if (role === 'lead') {
      await expect(page.getByTestId('maze-map')).toBeVisible();
      const walls = data.maze.join('').split('#').length - 1;
      await expect(page.locator('[data-wall="true"]')).toHaveCount(walls);
      await expect(page.getByTestId('maze-map').locator('[data-cell]')).toHaveCount(rows * cols);
      await expect(page.getByTestId('maze-board')).toHaveCount(0);
      await expect(page.locator('[data-move]')).toHaveCount(0);
    } else {
      await expect(page.getByTestId('maze-board').locator('[data-cell]')).toHaveCount(rows * cols);
      await expectAtStart(page, data);
      await expect(page.getByTestId('maze-map')).toHaveCount(0);
      // Die Ansicht des Steuernden darf nichts über Wände enthalten – sonst ließe sich das Rätsel allein lösen.
      expect(await page.getByTestId('task').innerHTML()).not.toContain('data-wall');
    }
  },

  async tryWrong(page, data) {
    await restart(page);
    // Beide geraden Wege enden am Ziel; die Inhaltsprüfung garantiert, dass sie eine Wand kreuzen.
    const { across, along } = straight(data);
    const first = [...across, ...along];
    await go(page, walk(data, first).clean ? [...along, ...across] : first);
    await expectAtStart(page, data);
  },

  async solve(page, data) {
    await restart(page);
    await go(page, solution(data));
  },
};
