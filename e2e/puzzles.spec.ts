// Jede Rätselvariante der Inhalte, gespielt von zwei Geräten über die Oberfläche: Erklärung vor dem ersten
// Start, jeder sieht nur seine Hälfte, ein falscher Versuch kostet nichts, und die Lösung des Handelnden
// schließt die Aufgabe für beide ab. Was eine Art dafür braucht, steht in e2e/puzzle-drivers/.
import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import type { Content } from '../shared/content-schema.ts';
import type { PuzzleData } from '../shared/puzzles/index.ts';
import { canSolve, type PuzzleKind, SOLVER } from '../shared/puzzles/kinds.ts';
import { closePhones, moveCard, openTab, openTask, pair, returnToApp, taskCard } from './phones.ts';
import type { PuzzleDriver } from './puzzle-drivers/driver.ts';
import { DRIVERS } from './puzzle-drivers/index.ts';

const content = JSON.parse(readFileSync('generated/content.json', 'utf8')) as Content;
const chapter = content.chapters[0]!;
const puzzles = chapter.tasks.filter((task) => task.type === 'puzzle');

test.afterEach(closePhones);

for (const task of puzzles) {
  test(`${task.kind} · ${task.id}: jeder sieht nur seine Hälfte, zu zweit ist es lösbar`, async ({ browser }) => {
    const driver = DRIVERS[task.kind] as PuzzleDriver<PuzzleKind>;
    const data = task.data as PuzzleData[PuzzleKind];
    const { a, b } = await pair(browser);
    await openTask([a, b], task.id);
    const done = chapter.taskOrder.indexOf(task.id);
    const lead = task.lead === 'a' ? a : b;
    const partner = task.lead === 'a' ? b : a;

    // Vor dem ersten Start erklärt jedes Gerät die Rätselart auf einem Bildschirm.
    for (const { page } of [a, b]) {
      await expect(taskCard(page)).toHaveAttribute('data-kind', task.kind);
      await expect(taskCard(page).getByRole('heading', { name: task.title })).toBeVisible();
      await expect(page.getByTestId('puzzle-intro')).toBeVisible();
      await expect(page.getByTestId('puzzle')).toHaveCount(0);
      await page.getByRole('button', { name: 'Got it' }).click();
      await expect(page.getByTestId('puzzle')).toBeVisible();
    }
    // Beim nächsten Öffnen steht das Rätsel gleich da.
    await openTab(lead.page, 'Home');
    await openTab(lead.page, 'Today');
    await expect(lead.page.getByTestId('puzzle-intro')).toHaveCount(0);

    // Die Rolle bestimmt die Ansicht.
    await expect(taskCard(lead.page)).toHaveAttribute('data-role', 'lead');
    await expect(taskCard(partner.page)).toHaveAttribute('data-role', 'partner');
    await driver.expectHalf(lead.page, 'lead', data);
    await driver.expectHalf(partner.page, 'partner', data);

    // Eingeben kann nur, wer in dieser Rätselart handelt.
    for (const [phone, role] of [[lead, 'lead'], [partner, 'partner']] as const) {
      await expect(phone.page.getByTestId('puzzle-input')).toHaveCount(canSolve(task.kind, role) ? 1 : 0);
    }
    const solver = SOLVER[task.kind] === 'partner' ? partner : lead;
    const other = solver === lead ? partner : lead;

    // Ein Fehlversuch: Rückmeldung, sonst nichts – beliebig oft, ohne Strafe.
    await driver.tryWrong(solver.page, data);
    await expect(solver.page.getByTestId('puzzle-feedback')).not.toBeEmpty();
    await expect(solver.page.getByTestId('today-progress')).toHaveText(new RegExp(`^${done} of `));
    await expect(taskCard(solver.page)).toBeVisible();

    // Die Lösung schließt die Aufgabe für beide ab und bringt den Bauzug.
    await driver.solve(solver.page, data);
    await expect(solver.page.getByTestId('task-done')).toBeVisible();
    await returnToApp(other.page);
    for (const { page } of [solver, other]) {
      await expect(page.getByTestId('task-done')).toBeVisible();
      await expect(page.getByTestId('today-progress')).toHaveText(new RegExp(`^${done + 1} of `));
      await expect(taskCard(page)).toHaveCount(0);
    }
    await openTab(other.page, 'Home');
    await expect(moveCard(other.page)).toBeVisible();
  });
}

test('jede Rätselart hat eine Variante in den Inhalten', () => {
  expect([...new Set(puzzles.map((p) => p.kind))].sort()).toEqual(Object.keys(DRIVERS).sort());
});
