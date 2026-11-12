// Gutscheine mit zwei Geräten: Ein geheimer Gutschein bleibt bis zum Meilenstein verhüllt – auch in dem,
// was der Server schickt – und durchläuft danach das Einlösen.
import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import type { Content } from '../shared/content-schema.ts';
import { closePhones, finishTestTask, giftsForMe, giftsFromMe, openTab, pair, recordResponses, returnToApp, syncStatus, wrapGift } from './phones.ts';

test.afterEach(closePhones);

const content = JSON.parse(await readFile('generated/content.json', 'utf8')) as Content;
const chapter = content.chapters[0]!;
const fixedAt = new Set(chapter.coupons.map((c) => c.milestone));
/** Hier wartet der erste geheime Gutschein. */
const milestone = chapter.milestones.find((m) => !fixedAt.has(m))!;

test('ein geheimer Gutschein von B erscheint bei A erst am Meilenstein mit Text', async ({ browser }) => {
  const { a, b } = await pair(browser);
  const secret = 'A walk at sunrise 0815';
  const sentToA = recordResponses(a.page);

  await wrapGift(b.page, secret);
  await expect(giftsFromMe(b.page)).toHaveAttribute('data-state', 'veiled');
  await expect(giftsFromMe(b.page)).toContainText(secret);

  // A sieht nur, dass etwas wartet.
  await openTab(a.page, 'Gifts');
  await returnToApp(a.page);
  await expect(giftsForMe(a.page)).toHaveAttribute('data-state', 'veiled');
  await expect(giftsForMe(a.page)).toContainText('A wrapped gift from Bao');
  await expect(giftsForMe(a.page)).toContainText(`Opens after ${milestone} tasks`);

  // Eine Aufgabe vor dem Meilenstein: weiter verhüllt, der Text war noch in keiner Antwort an A.
  for (let i = 0; i < milestone - 1; i++) await finishTestTask(b.page);
  await returnToApp(a.page);
  await openTab(a.page, 'Today');
  await expect(a.page.getByTestId('today-progress')).toHaveText(new RegExp(`^${milestone - 1} of `));
  await openTab(a.page, 'Gifts');
  await expect(giftsForMe(a.page)).toHaveAttribute('data-state', 'veiled');
  await expect(a.page.getByText(secret)).toHaveCount(0);
  await expect(syncStatus(a.page)).toHaveText('Up to date.');
  const before = await sentToA.texts();
  expect(before.length).toBeGreaterThan(0);
  expect(before.join('\n')).not.toContain(secret);

  // Der Meilenstein: A bekommt die Szene, das Geschenk ist noch zu.
  await finishTestTask(b.page);
  await returnToApp(a.page);
  const scene = a.page.getByTestId('milestone');
  await expect(scene).toContainText(`${milestone} tasks together`);
  await expect(scene.getByText(secret)).toHaveCount(0);
  await scene.getByRole('button', { name: 'Open the gift' }).click();
  await expect(a.page.getByTestId('gift-inside')).toContainText('From Bao, for you');
  await expect(a.page.getByTestId('gift-inside')).toContainText(secret);
  // Ein Gutschein liegt im Geschenk – also kein Dekostück.
  await expect(a.page.getByTestId('gift-inside')).not.toContainText('A special piece');
  expect((await sentToA.texts()).join('\n')).toContain(secret);

  await scene.getByRole('button', { name: 'See your gifts' }).click();
  await expect(scene).toBeHidden();
  await expect(giftsForMe(a.page)).toHaveAttribute('data-state', 'unlocked');
  await expect(giftsForMe(a.page)).toContainText(secret);
});

test('Einlösen durchläuft verhüllt, freigeschaltet und eingelöst – der Schenkende bestätigt', async ({ browser }) => {
  const { a, b } = await pair(browser);
  const secret = 'Pancakes on Sunday';
  await wrapGift(b.page, secret);
  // Erst wenn der Server den Gutschein hat, kann A ihn beim Abgleich sehen.
  await expect(giftsFromMe(b.page)).toHaveAttribute('data-state', 'veiled');
  await openTab(a.page, 'Gifts');
  await returnToApp(a.page);

  // Verhüllt: nichts einzulösen.
  await expect(giftsForMe(a.page)).toHaveAttribute('data-state', 'veiled');
  await expect(giftsForMe(a.page).getByRole('button')).toHaveCount(0);

  for (let i = 0; i < milestone; i++) await finishTestTask(b.page);
  // B, der Schenkende, sieht im Geschenk den eigenen Gutschein.
  const sceneB = b.page.getByTestId('milestone');
  await sceneB.getByRole('button', { name: 'Open the gift' }).click();
  await expect(b.page.getByTestId('gift-inside')).toContainText('Your gift for Ada is unwrapped');
  await sceneB.getByRole('button', { name: 'Continue' }).click();

  await returnToApp(a.page);
  const sceneA = a.page.getByTestId('milestone');
  await sceneA.getByRole('button', { name: 'Open the gift' }).click();
  await sceneA.getByRole('button', { name: 'See your gifts' }).click();

  // Freigeschaltet: Die Beschenkte fragt an. Bestätigen kann sie nicht.
  const mine = giftsForMe(a.page);
  await expect(mine).toHaveAttribute('data-state', 'unlocked');
  await expect(mine.getByRole('button')).toHaveCount(1);
  await mine.getByRole('button', { name: 'Redeem' }).click();
  await expect(mine).toContainText('You asked to redeem it. Now Bao says when it\'s done.');
  await expect(mine.getByRole('button')).toHaveCount(0);
  await expect(mine).toHaveAttribute('data-state', 'unlocked');

  // Der Schenkende sieht die Anfrage (Punkt am Reiter) und bestätigt.
  await openTab(b.page, 'Home');
  await returnToApp(b.page);
  await expect(b.page.getByTestId('waiting-gifts')).toBeVisible();
  await openTab(b.page, 'Gifts');
  const given = giftsFromMe(b.page);
  await expect(given).toContainText('Ada would like to redeem this.');
  await given.getByRole('button', { name: 'Done – mark as redeemed' }).click();
  await expect(given).toHaveAttribute('data-state', 'redeemed');
  await expect(given).toContainText('Redeemed');
  await expect(b.page.getByTestId('waiting-gifts')).toHaveCount(0);

  // Eingelöst – bei beiden, und es gibt nichts mehr zu tippen.
  await returnToApp(a.page);
  await expect(mine).toHaveAttribute('data-state', 'redeemed');
  await expect(mine).toContainText(secret);
  await expect(mine.getByRole('button')).toHaveCount(0);
});
