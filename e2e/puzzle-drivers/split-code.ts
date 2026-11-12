// Geteilter Code über die Oberfläche: Rolle 1 hat Regeln, Schloss und Symbole, Rolle 2 die Reihe.
import { expect, type Page } from '@playwright/test';
import { palette, solution, type SplitCodeData } from '../../shared/puzzles/split-code.ts';
import type { Glyph } from '../../shared/puzzles/tiles.ts';
import type { PuzzleDriver } from './driver.ts';

async function enter(page: Page, code: Glyph[]): Promise<void> {
  await page.getByRole('button', { name: 'Clear' }).click();
  for (const glyph of code) await page.locator(`[data-choice="${glyph}"]`).click();
  await page.getByTestId('puzzle-check').click();
}

export const driver: PuzzleDriver<'split-code'> = {
  async expectHalf(page, role, data: SplitCodeData) {
    if (role === 'lead') {
      await expect(page.getByTestId('code-rules').getByRole('listitem')).toHaveCount(data.code.length);
      await expect(page.getByTestId('code-slot')).toHaveCount(data.code.length);
      // Die Symbole am Schloss verraten die Reihenfolge der Reihe nicht.
      const shown = await page.locator('[data-choice]').evaluateAll((nodes) => nodes.map((node) => node.getAttribute('data-choice')));
      expect(shown).toEqual(palette(data));
      expect(shown).not.toEqual(data.row);
      await expect(page.getByTestId('code-row')).toHaveCount(0);
    } else {
      const row = await page.getByTestId('code-row').getByRole('listitem').evaluateAll((nodes) => nodes.map((node) => node.getAttribute('data-glyph-name')));
      expect(row).toEqual(data.row);
      await expect(page.getByTestId('code-rules')).toHaveCount(0);
      await expect(page.getByTestId('code-slot')).toHaveCount(0);
    }
  },

  async tryWrong(page, data) {
    const right = solution(data);
    // Dieselben Symbole in anderer Reihenfolge – oder, wenn das nichts ändert, ein anderes an erster Stelle.
    const turned = [...right].reverse();
    const other = palette(data).find((glyph) => glyph !== right[0]) ?? right[0]!;
    await enter(page, turned.join() === right.join() ? [other, ...right.slice(1)] : turned);
  },

  async solve(page, data) {
    await enter(page, solution(data));
  },
};
