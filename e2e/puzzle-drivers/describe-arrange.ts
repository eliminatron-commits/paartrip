// Beschreiben und Anordnen über die Oberfläche: Rolle 1 sieht das Zielbild, Rolle 2 hat das leere Raster und den Vorrat.
import { expect, type Page } from '@playwright/test';
import { type DescribeArrangeAttempt, type DescribeArrangeData, isSolved, solution } from '../../shared/puzzles/describe-arrange.ts';
import type { PuzzleDriver } from './driver.ts';

/** Leert das Raster, legt jedes belegte Feld von `picture` nach und drückt auf Prüfen. */
async function lay(page: Page, picture: DescribeArrangeAttempt): Promise<void> {
  await page.getByRole('button', { name: 'Start over' }).click();
  for (const [cell, tile] of picture.entries()) {
    if (tile === null) continue;
    await page.locator(`[data-tile="${tile}"]`).click();
    await page.locator(`[data-testid="arrange-cell"][data-cell="${cell}"]`).click();
  }
  await page.getByTestId('puzzle-check').click();
}

export const driver: PuzzleDriver<'describe-arrange'> = {
  async expectHalf(page, role, data: DescribeArrangeData) {
    if (role === 'lead') {
      const names = await page
        .getByTestId('arrange-target')
        .locator('[data-cell]')
        .evaluateAll((nodes) =>
          nodes
            .map((node) => ({ cell: Number(node.getAttribute('data-cell')), name: node.getAttribute('data-glyph-name') }))
            .sort((a, b) => a.cell - b.cell)
            .map((entry) => entry.name),
        );
      expect(names).toEqual(data.target.map((tile) => (tile === null ? null : data.tiles[tile])));
      await expect(page.locator('[data-tile]')).toHaveCount(0);
      await expect(page.getByTestId('arrange-cell')).toHaveCount(0);
    } else {
      await expect(page.getByTestId('arrange-cell')).toHaveCount(data.cols * data.rows);
      await expect(page.getByTestId('arrange-cell').and(page.locator('[data-glyph-name]'))).toHaveCount(0);
      await expect(page.locator('[data-tile]')).toHaveCount(data.tiles.length);
      await expect(page.getByTestId('arrange-target')).toHaveCount(0);
    }
  },

  async tryWrong(page, data) {
    // Zwei verschiedene Felder des Zielbilds tauschen: Das Bild ändert sich, also ist es falsch.
    const wrong = solution(data);
    const first = wrong.findIndex((tile) => tile !== wrong[0]);
    if (first === -1) throw new Error('describe-arrange: Zielbild hat keine zwei verschiedenen Felder');
    [wrong[0], wrong[first]] = [wrong[first]!, wrong[0]!];
    expect(isSolved(data, wrong)).toBe(false);
    await lay(page, wrong);
  },

  async solve(page, data) {
    await lay(page, solution(data));
  },
};
