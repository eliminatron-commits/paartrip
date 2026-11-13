// Das Haus mit zwei Geräten: Bauzug mit Rollenwechsel, Umstellen, Erinnerungsstücke, Meilenstein mit Dekostück
// und der Start ohne Netz. Aufgaben entstehen hier über die Test-Aktion des lokalen Workers.
import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import type { Content } from '../shared/content-schema.ts';
import { closePhones, finishTask, motions, moveCard, openTab, pair, type Phone, pieceInHouse, recordMotion, returnToApp, syncStatus } from './phones.ts';

test.afterEach(closePhones);

// Erwartungen kommen aus den Inhalten, nicht aus festen Werten im Test.
const content = JSON.parse(await readFile('generated/content.json', 'utf8')) as Content;
const chapter = content.chapters[0]!;
const fixedAt = new Set(chapter.coupons.map((c) => c.milestone));
/** Der erste Meilenstein ohne festen Gutschein: Dort liegt ein Dekostück im Geschenk, wenn niemand etwas hinterlegt. */
const freeMilestone = chapter.milestones.find((m) => !fixedAt.has(m))!;
const deco = chapter.pieces.find((p) => p.milestone === freeMilestone)!;
const scene = chapter.story.find((s) => s.milestone === freeMilestone)!;

/** Spielt den offenen Bauzug: `chooser` nimmt das erste Angebot, `placer` den ersten leuchtenden Platz. */
async function playTurn(chooser: Phone, placer: Phone): Promise<{ pieceId: string; spotId: string }> {
  await openTab(chooser.page, 'Home');
  await openTab(placer.page, 'Home');
  await returnToApp(chooser.page);
  await returnToApp(placer.page);
  await expect(moveCard(chooser.page)).toHaveAttribute('data-kind', 'choose');
  // Wer platziert, wartet – und hat nichts zu wählen.
  await expect(moveCard(placer.page)).toHaveAttribute('data-kind', 'wait-choose');
  await expect(placer.page.getByRole('radio')).toHaveCount(0);

  const options = chooser.page.getByRole('radio');
  await expect(options).toHaveCount(chapter.build.offerSize);
  const option = options.first();
  const pieceId = (await option.getAttribute('data-piece')) ?? '';
  const name = (await option.locator('.name').innerText()).toLowerCase();
  await option.click();
  await chooser.page.getByRole('button', { name: `Choose the ${name}` }).click();
  await expect(moveCard(chooser.page)).toHaveAttribute('data-kind', 'wait-place');
  // Gewählt ist noch nicht platziert.
  await expect(pieceInHouse(chooser.page, pieceId)).toHaveCount(0);

  await returnToApp(placer.page);
  await expect(moveCard(placer.page)).toHaveAttribute('data-kind', 'place');
  await expect(moveCard(placer.page)).toContainText(`picked the ${name}`);
  await placer.page.getByRole('button', { name: 'Find a spot' }).click();
  await expect(placer.page.getByTestId('placing-bar')).toContainText(`Tap a glowing spot for the ${name}.`);
  const target = placer.page.locator('button.target').first();
  const spotId = (await target.getAttribute('data-spot')) ?? '';
  await target.click();

  // Das Stück steht bei beiden am selben Platz – beim anderen nach dem Abgleich.
  await expect(pieceInHouse(placer.page, pieceId)).toHaveAttribute('data-spot', spotId);
  await returnToApp(chooser.page);
  await expect(pieceInHouse(chooser.page, pieceId)).toHaveAttribute('data-spot', spotId);
  return { pieceId, spotId };
}

test('Bauzug: einer wählt, der andere platziert – beim nächsten Zug sind die Rollen getauscht', async ({ browser }) => {
  const { a, b } = await pair(browser);
  // Die Inhalte legen fest, wer den ersten Zug wählt.
  const [first, second] = chapter.build.firstChooser === 'a' ? [a, b] : [b, a];

  await openTab(a.page, 'Home');
  await expect(moveCard(a.page)).toHaveCount(0);
  await expect(a.page.getByText('Dọn về nhà mới')).toBeVisible();

  await finishTask(a);
  const one = await playTurn(first, second);
  await expect(moveCard(a.page)).toHaveCount(0);
  await expect(moveCard(b.page)).toHaveCount(0);

  await finishTask(b);
  const two = await playTurn(second, first);
  expect(two.pieceId).not.toBe(one.pieceId);
  expect(two.spotId).not.toBe(one.spotId);

  // Beide Stücke stehen, auch nach dem Neuladen.
  await a.page.reload();
  await expect(pieceInHouse(a.page, one.pieceId)).toHaveAttribute('data-spot', one.spotId);
  await expect(pieceInHouse(a.page, two.pieceId)).toHaveAttribute('data-spot', two.spotId);
});

test('ein platziertes Stück können beide umstellen', async ({ browser }) => {
  const { a, b } = await pair(browser);
  const [first, second] = chapter.build.firstChooser === 'a' ? [a, b] : [b, a];
  await finishTask(a);
  const { pieceId, spotId } = await playTurn(first, second);

  // Wer gewählt hat, stellt um: Stück antippen, "Move", neuer Platz.
  const mover = first.page;
  await mover.locator(`button.piece[data-spot="${spotId}"]`).click();
  await expect(mover.getByTestId('piece-bar')).toBeVisible();
  await mover.getByTestId('piece-bar').getByRole('button', { name: 'Move' }).click();
  const target = mover.locator('button.target').first();
  const moved = (await target.getAttribute('data-spot')) ?? '';
  expect(moved).not.toBe(spotId);
  await target.click();
  await expect(pieceInHouse(mover, pieceId)).toHaveAttribute('data-spot', moved);
  await expect(pieceInHouse(mover, pieceId)).toHaveCount(1);

  await returnToApp(second.page);
  await expect(pieceInHouse(second.page, pieceId)).toHaveAttribute('data-spot', moved);

  // Abbrechen lässt alles, wie es ist.
  await second.page.locator(`button.piece[data-spot="${moved}"]`).click();
  await second.page.getByTestId('piece-bar').getByRole('button', { name: 'Move' }).click();
  await second.page.getByTestId('placing-bar').getByRole('button', { name: 'Cancel' }).click();
  await expect(second.page.locator('button.target')).toHaveCount(0);
  await expect(pieceInHouse(second.page, pieceId)).toHaveAttribute('data-spot', moved);
});

test('ein gedrückter Platz bleibt unter dem Finger – das Stück kommt dort an, wo losgelassen wird', async ({ browser }) => {
  const { a, b } = await pair(browser);
  const [first, second] = chapter.build.firstChooser === 'a' ? [a, b] : [b, a];
  await finishTask(a);
  for (const { page } of [first, second]) {
    await openTab(page, 'Home');
    await returnToApp(page);
  }
  const pieceId = (await first.page.getByRole('radio').first().getAttribute('data-piece')) ?? '';
  await first.page.getByRole('radio').first().click();
  await first.page.getByRole('button', { name: /^Choose the / }).click();
  await expect(moveCard(first.page)).toHaveAttribute('data-kind', 'wait-place');

  // Ohne Übergänge zeigt sich ein Sprung sofort und nicht erst nach und nach.
  const placer = second.page;
  await placer.emulateMedia({ reducedMotion: 'reduce' });
  await returnToApp(placer);
  await placer.getByRole('button', { name: 'Find a spot' }).click();
  const target = placer.locator('button.target').first();
  const spotId = (await target.getAttribute('data-spot')) ?? '';
  const before = (await target.boundingBox())!;
  await placer.mouse.move(before.x + before.width / 2, before.y + before.height / 2);
  await placer.mouse.down();
  // Gedrückt darf der Platz kaum merklich nachgeben, aber nicht unter dem Finger wegrutschen.
  const pressed = (await target.boundingBox())!;
  expect(Math.abs(pressed.x + pressed.width / 2 - (before.x + before.width / 2))).toBeLessThan(2);
  expect(Math.abs(pressed.y + pressed.height / 2 - (before.y + before.height / 2))).toBeLessThan(2);
  await placer.mouse.up();
  await expect(pieceInHouse(placer, pieceId)).toHaveAttribute('data-spot', spotId);
});

test('ein Stück, das dazukommt, setzt sich ab – beim Öffnen des Hauses und mit "Bewegung reduzieren" steht es still', async ({ browser }) => {
  const { a, b } = await pair(browser);
  const [first, second] = chapter.build.firstChooser === 'a' ? [a, b] : [b, a];
  await finishTask(a);
  const { pieceId, spotId } = await playTurn(first, second);
  const mover = first.page;
  await recordMotion(mover);
  /** Begonnene Bewegungen an der Gruppe um das Stück (dort hängt der Übergang). */
  const settling = async () => (await motions(mover)).filter((motion) => motion.piece === pieceId);
  /** Zwei Bilder abwarten: Was hätte beginnen sollen, hat dann begonnen. */
  const frames = () => mover.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))));

  async function move(from: string): Promise<string> {
    await mover.locator(`button.piece[data-spot="${from}"]`).click();
    await mover.getByTestId('piece-bar').getByRole('button', { name: 'Move' }).click();
    const target = mover.locator('button.target').first();
    const to = (await target.getAttribute('data-spot')) ?? '';
    await target.click();
    await expect(pieceInHouse(mover, pieceId)).toHaveAttribute('data-spot', to);
    return to;
  }

  // Umgestellt: Am neuen Platz sinkt es ein und federt nach.
  const moved = await move(spotId);
  await expect.poll(settling).not.toEqual([]);

  // Beim Öffnen des Hauses steht alles still da (nach dem Neuladen beginnt die Aufzeichnung von vorn).
  await mover.reload();
  await expect(pieceInHouse(mover, pieceId)).toHaveAttribute('data-spot', moved);
  await frames();
  expect(await settling()).toEqual([]);

  // Mit "Bewegung reduzieren" kommt es ohne Bewegung an.
  await mover.emulateMedia({ reducedMotion: 'reduce' });
  await move(moved);
  await frames();
  expect(await settling()).toEqual([]);
});

test('eine beantwortete Kennst-du-mich-Frage hängt als Erinnerungsstück im Haus und bleibt lesbar', async ({ browser }) => {
  const { a, b } = await pair(browser);
  const index = chapter.tasks.findIndex((t) => t.type === 'knowme');
  const task = chapter.tasks[index]!;
  if (task.type !== 'knowme') throw new Error('Inhalte ohne Kennst-du-mich-Aufgabe');

  await openTab(a.page, 'Home');
  await expect(a.page.getByTestId('memory')).toHaveCount(0);
  for (let i = 0; i <= index; i++) await finishTask(a);

  for (const { page } of [a, b]) {
    await openTab(page, 'Home');
    await returnToApp(page);
    await expect(page.getByTestId('memory')).toHaveCount(1);
    await page.getByTestId('memory').click();
    const sheet = page.getByRole('dialog', { name: 'A memory' });
    await expect(sheet).toContainText(task.question);
    await expect(sheet).toContainText('Ada');
    await expect(sheet).toContainText('Bao');
    await sheet.getByRole('button', { name: 'Close' }).click();
    await expect(sheet).toBeHidden();
  }
});

test('Meilenstein ohne Gutschein: Szene, Geschenk mit Dekostück, einer stellt es auf', async ({ browser }) => {
  const { a, b } = await pair(browser);
  for (let i = 0; i < freeMilestone; i++) await finishTask(a);

  // A sieht die Szene; das Geschenk ist noch zu.
  const sceneA = a.page.getByTestId('milestone');
  await expect(sceneA).toContainText(`${freeMilestone} tasks together`);
  await expect(sceneA.getByRole('heading', { name: scene.title })).toBeVisible();
  await expect(sceneA).toContainText(scene.text.slice(0, 40));
  await expect(sceneA.getByText(deco.name)).toHaveCount(0);

  await sceneA.getByRole('button', { name: 'Open the gift' }).click();
  await expect(a.page.getByTestId('gift-inside')).toContainText(deco.name);
  await sceneA.getByRole('button', { name: 'Find a spot for it' }).click();
  await expect(sceneA).toBeHidden();

  // Direkt im Haus: Die passenden Plätze leuchten.
  const target = a.page.locator('button.target').first();
  const spotId = (await target.getAttribute('data-spot')) ?? '';
  await target.click();
  await expect(pieceInHouse(a.page, deco.id)).toHaveAttribute('data-spot', spotId);

  // B bekommt Szene und Geschenk ebenfalls; das Stück steht schon.
  await returnToApp(b.page);
  const sceneB = b.page.getByTestId('milestone');
  await expect(sceneB.getByRole('heading', { name: scene.title })).toBeVisible();
  await sceneB.getByRole('button', { name: 'Open the gift' }).click();
  await expect(b.page.getByTestId('gift-inside')).toContainText(deco.name);
  await sceneB.getByRole('button', { name: 'Continue' }).click();
  await expect(sceneB).toBeHidden();
  await openTab(b.page, 'Home');
  await expect(pieceInHouse(b.page, deco.id)).toHaveAttribute('data-spot', spotId);

  // Gesehen bleibt gesehen – auch nach dem Neuladen.
  await expect(syncStatus(b.page)).toHaveText('Up to date.');
  await b.page.reload();
  await expect(b.page.getByTestId('house-names')).toHaveText('Bao & Ada');
  await expect(b.page.getByTestId('milestone')).toHaveCount(0);
});

test('die App startet ohne Netz mit dem letzten Stand', async ({ browser }) => {
  const { a, b } = await pair(browser);
  const [first, second] = chapter.build.firstChooser === 'a' ? [a, b] : [b, a];
  await finishTask(a);
  const { pieceId, spotId } = await playTurn(first, second);

  // Der Service Worker muss die Seite steuern, damit sie ohne Netz neu lädt.
  await a.page.waitForFunction(() => navigator.serviceWorker.controller !== null);
  await a.context.setOffline(true);
  await a.page.reload();

  await expect(a.page.getByTestId('house-names')).toHaveText('Ada & Bao');
  await expect(pieceInHouse(a.page, pieceId)).toHaveAttribute('data-spot', spotId);
  await expect(a.page.getByTestId('progress')).toContainText('1 task done together');
  await expect(syncStatus(a.page)).toHaveText('Offline. Showing what was saved last.');
  // Auch die anderen Bildschirme zeigen, was zuletzt galt.
  await openTab(a.page, 'Gifts');
  await expect(a.page.locator('[data-testid="gift"][data-kind="fixed"]')).toHaveCount(chapter.coupons.length);
});
