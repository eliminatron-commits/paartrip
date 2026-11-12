// Karte und Legende über die Oberfläche: Rolle 1 hat den Grundriss mit den Verstecken, Rolle 2 Legende und Hinweise.
import { expect, type Page } from '@playwright/test';
import { type MapLegendData, planCells, solution } from '../../shared/puzzles/map-legend.ts';
import type { PuzzleDriver } from './driver.ts';

const spotKeys = (data: MapLegendData): string[] => planCells(data).flat().flatMap((cell) => (cell.kind === 'spot' ? cell.key : []));
const spot = (page: Page, key: string) => page.locator(`[data-spot="${key}"]`);

/** Markiert genau diese Verstecke – was vorher markiert war, wird erst abgewählt – und lässt die Auswahl prüfen. */
async function guess(page: Page, keys: string[]): Promise<void> {
  const marked = await page.locator('[data-spot][aria-pressed="true"]').evaluateAll((nodes) => nodes.map((node) => node.getAttribute('data-spot') ?? ''));
  for (const key of marked) await spot(page, key).click();
  await expect(page.locator('[data-spot][aria-pressed="true"]')).toHaveCount(0);
  for (const key of keys) await spot(page, key).click();
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

      // Ein einzelnes Versteck anzutippen verrät nichts: Ein richtiges und ein falsches sehen markiert gleich aus,
      // es gibt keine Rückmeldung, und prüfen lässt sich erst die ganze Auswahl.
      const right = solution(data)[0];
      const wrong = spotKeys(data).find((key) => !solution(data).includes(key));
      if (right === undefined || wrong === undefined) throw new Error('Der Grundriss braucht ein richtiges und ein falsches Versteck');
      await spot(page, right).click();
      await expect(page.getByTestId('puzzle-feedback')).toBeEmpty();
      await expect(page.getByTestId('puzzle-check')).toBeDisabled();
      await spot(page, wrong).click();
      await expect(spot(page, wrong)).toHaveAttribute('aria-pressed', 'true');
      expect(await spot(page, right).getAttribute('class')).toBe(await spot(page, wrong).getAttribute('class'));
      await expect(page.getByTestId('puzzle-feedback')).toBeEmpty();
      await spot(page, right).click();
      await spot(page, wrong).click();
      await expect(page.locator('[data-spot][aria-pressed="true"]')).toHaveCount(0);
    } else {
      for (const { name } of data.landmarks) await expect(page.getByTestId('map-legend')).toContainText(name);
      for (const clue of data.clues) await expect(page.getByTestId('map-clues')).toContainText(clue);
      await expect(page.locator('[data-spot]')).toHaveCount(0);
    }
  },

  async tryWrong(page, data) {
    // Fast richtig: alle Verstecke bis auf eines. Auch das darf nur "stimmt nicht" ergeben.
    const right = solution(data);
    const other = spotKeys(data).find((key) => !right.includes(key));
    if (other === undefined) throw new Error('Der Grundriss hat kein falsches Versteck');
    await guess(page, [...right.slice(1), other]);
  },

  async solve(page, data) {
    await guess(page, solution(data));
  },
};
