// Zwei Bilder vergleichen über die Oberfläche: beide Rollen sehen nur ihre Fassung und markieren Felder.
import { expect, type Page } from '@playwright/test';
import { isSolved, solution, type SpotDifferenceData, versionFor } from '../../shared/puzzles/spot-difference.ts';
import type { PuzzleDriver } from './driver.ts';

async function mark(page: Page, cells: number[]): Promise<void> {
  await page.getByRole('button', { name: 'Clear' }).click();
  for (const cell of cells) await page.locator(`[data-testid="spot-cell"][data-cell="${cell}"]`).click();
  await page.getByTestId('puzzle-check').click();
}

export const driver: PuzzleDriver<'spot-difference'> = {
  async expectHalf(page, role, data: SpotDifferenceData) {
    const cells = page.getByTestId('spot-cell');
    await expect(cells).toHaveCount(data.cols * data.rows);
    const shown = await cells.evaluateAll((nodes) =>
      nodes
        .map((node) => ({ cell: Number(node.getAttribute('data-cell')), glyph: node.getAttribute('data-glyph-name'), pressed: node.getAttribute('aria-pressed') }))
        .sort((x, y) => x.cell - y.cell),
    );
    const mine = versionFor(data, role);
    expect(shown.map((s) => s.glyph)).toEqual(mine);
    // An jedem Unterschied zeigt diese Seite ausdrücklich nicht die Fassung der anderen Rolle.
    const theirs = versionFor(data, role === 'lead' ? 'partner' : 'lead');
    for (const { cell } of data.changes) expect(shown[cell]!.glyph).not.toBe(theirs[cell]);
    // Zu Beginn ist nichts markiert.
    expect(shown.every((s) => s.pressed === 'false')).toBe(true);
  },

  async tryWrong(page, data) {
    // Mindestens zwei Unterschiede: Einer allein ist nie die Lösung.
    const first = solution(data).slice(0, 1);
    expect(isSolved(data, first)).toBe(false);
    await mark(page, first);
  },

  async solve(page, data) {
    await mark(page, solution(data));
  },
};
