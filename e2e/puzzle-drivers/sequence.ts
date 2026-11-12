// Reihenfolge über die Oberfläche: Rolle 1 ordnet die Schritte mit den Pfeilen, Rolle 2 liest die Hinweise.
import { expect, type Page } from '@playwright/test';
import { isSolved, type SequenceData, solution, startOrder } from '../../shared/puzzles/sequence.ts';
import type { PuzzleDriver } from './driver.ts';

/** Die Schritt-Nummern (`data-step`) in der Reihenfolge, wie sie gerade im DOM stehen. */
async function current(page: Page): Promise<number[]> {
  const steps = await page.getByTestId('sequence-step').evaluateAll((nodes) => nodes.map((node) => node.getAttribute('data-step')));
  return steps.map(Number);
}

export const driver: PuzzleDriver<'sequence'> = {
  async expectHalf(page, role, data: SequenceData) {
    if (role === 'lead') {
      // Die Anfangsreihenfolge ist fest und nie die Lösung.
      await expect.poll(() => current(page)).toEqual(startOrder(data));
      expect(startOrder(data)).not.toEqual(solution(data));
      for (const step of data.steps) await expect(page.getByTestId('puzzle-input').getByText(step, { exact: true })).toBeVisible();
      await expect(page.getByTestId('sequence-hints')).toHaveCount(0);
      // Die Hinweise stehen nirgends auf der Karte dieser Seite.
      const card = await page.getByTestId('task').innerText();
      for (const hint of data.hints) expect(card).not.toContain(hint);
    } else {
      for (const hint of data.hints) await expect(page.getByTestId('sequence-hints').getByText(hint)).toBeVisible();
      await expect(page.getByTestId('sequence-step')).toHaveCount(0);
    }
  },

  async tryWrong(page, data) {
    // Vielleicht wurde schon umsortiert: ist die Reihenfolge zufällig richtig, erst zwei Einträge tauschen.
    if (isSolved(data, await current(page))) {
      await page.getByRole('button', { name: /^Move down:/ }).first().click();
      expect(isSolved(data, await current(page))).toBe(false);
    }
    await page.getByTestId('puzzle-check').click();
  },

  async solve(page, data) {
    const right = solution(data);
    for (let place = 0; place < right.length; place++) {
      const step = right[place]!;
      // Den Schritt so oft nach oben schieben, bis er an seiner Stelle steht; die Liste jedes Mal neu aus dem DOM lesen.
      for (;;) {
        const at = (await current(page)).indexOf(step);
        if (at <= place) break;
        await page.getByTestId('sequence-step').nth(at).getByRole('button', { name: /^Move up:/ }).click();
      }
    }
    expect(await current(page)).toEqual(right);
    await page.getByTestId('puzzle-check').click();
  },
};
