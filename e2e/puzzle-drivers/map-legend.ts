// Karte und Legende über die Oberfläche: Rolle 1 hat den Grundriss mit den Verstecken, Rolle 2 Legende und Hinweise.
import { expect, type Page } from '@playwright/test';
import { type MapLegendData, planCells, solution } from '../../shared/puzzles/map-legend.ts';
import type { PuzzleDriver } from './driver.ts';

const spotKeys = (data: MapLegendData): string[] => planCells(data).flat().flatMap((cell) => (cell.kind === 'spot' ? cell.key : []));

async function guess(page: Page, key: string): Promise<void> {
  await page.locator(`[data-spot="${key}"]`).click();
  await page.getByTestId('puzzle-check').click();
}

export const driver: PuzzleDriver<'map-legend'> = {
  async expectHalf(page, role, data: MapLegendData) {
    const card = page.getByTestId('task');
    if (role === 'lead') {
      await expect(page.locator('[data-spot]')).toHaveCount(spotKeys(data).length);
      await expect(page.getByTestId('puzzle-input').locator('[data-glyph]')).toHaveCount(data.landmarks.length);
      await expect(page.getByTestId('map-legend')).toHaveCount(0);
      await expect(page.getByTestId('map-clues')).toHaveCount(0);
      // Weder Namen noch Hinweise stehen sichtbar oder versteckt in der Karte.
      const text = await card.innerText();
      const html = await card.innerHTML();
      for (const { name } of data.landmarks) {
        expect(text).not.toContain(name);
        expect(html).not.toContain(name);
      }
      for (const clue of data.clues) {
        expect(text).not.toContain(clue);
        expect(html).not.toContain(clue);
      }
    } else {
      for (const { name } of data.landmarks) await expect(page.getByTestId('map-legend')).toContainText(name);
      for (const clue of data.clues) await expect(page.getByTestId('map-clues')).toContainText(clue);
      await expect(page.locator('[data-spot]')).toHaveCount(0);
    }
  },

  async tryWrong(page, data) {
    const right = solution(data);
    const other = spotKeys(data).find((key) => key !== right);
    if (other === undefined) throw new Error('Der Grundriss hat kein falsches Versteck');
    await guess(page, other);
  },

  async solve(page, data) {
    await guess(page, solution(data));
  },
};
