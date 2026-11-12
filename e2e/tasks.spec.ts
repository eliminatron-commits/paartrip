// Der Aufgabenablauf mit zwei Geräten über die Oberfläche: Kennst-du-mich mit Aufdecken und Herz, Aufgaben im
// echten Leben mit Bestätigung, die Tagesregel mit gestellter Uhr – und dass niemand festhängt, wenn einer offline ist.
import { readFileSync } from 'node:fs';
import { expect, type Page, test } from '@playwright/test';
import type { Content, Task } from '../shared/content-schema.ts';
import { otherSlot } from '../shared/model.ts';
import type { PuzzleData } from '../shared/puzzles/index.ts';
import { canSolve, type PuzzleKind } from '../shared/puzzles/kinds.ts';
import { nextDay } from '../shared/time.ts';
import { closePhones, giftsFromMe, openTab, openTask, pair, passMilestone, type Phone, recordResponses, returnToApp, setClock, taskCard, wrapGift } from './phones.ts';
import type { PuzzleDriver } from './puzzle-drivers/driver.ts';
import { DRIVERS } from './puzzle-drivers/index.ts';

const chapter = (JSON.parse(readFileSync('generated/content.json', 'utf8')) as Content).chapters[0]!;
const pick = <T extends Task>(match: (task: Task) => task is T): T => {
  const task = chapter.tasks.find(match);
  if (!task) throw new Error('Aufgabe fehlt in den Inhalten');
  return task;
};
type KnowMe = Extract<Task, { type: 'knowme' }>;
type RealLife = Extract<Task, { type: 'reallife' }>;
const choiceQuestion = pick((t): t is KnowMe => t.type === 'knowme' && t.answer.kind === 'choice');
const textQuestion = pick((t): t is KnowMe => t.type === 'knowme' && t.answer.kind === 'text');
const forOne = pick((t): t is RealLife => t.type === 'reallife' && t.doer !== 'both');
const forBoth = pick((t): t is RealLife => t.type === 'reallife' && t.doer === 'both');
const first = chapter.tasks[0]!;

test.afterEach(closePhones);
// Zwei Geräte, die erst bis zur gesuchten Aufgabe spielen: Unter Last reicht die übliche halbe Minute nicht.
test.describe.configure({ timeout: 90_000 });

const reveal = (page: Page) => page.getByTestId('reveal');
const progress = (page: Page) => page.getByTestId('today-progress');
const done = (taskId: string) => chapter.taskOrder.indexOf(taskId);

/** Wartet auf die aufgedeckten Antworten; hat die Frage einen Meilenstein erreicht, geht es erst an dessen Szene vorbei. */
async function seeReveal(page: Page): Promise<void> {
  await expect(reveal(page)).toBeVisible();
  await passMilestone(page);
  await expect(page.getByTestId('milestone')).toHaveCount(0);
}

/** Löst das erste Rätsel der Inhalte auf dem Gerät dessen, der handelt. Liefert, wer gelöst hat und wer nicht. */
async function solveFirstPuzzle(a: Phone, b: Phone): Promise<{ solver: Phone; other: Phone }> {
  if (first.type !== 'puzzle') throw new Error('Die erste Aufgabe der Inhalte ist kein Rätsel');
  const solverSlot = canSolve(first.kind, 'lead') ? first.lead : otherSlot(first.lead);
  const solver = solverSlot === 'a' ? a : b;
  const other = solverSlot === 'a' ? b : a;
  await (DRIVERS[first.kind] as PuzzleDriver<PuzzleKind>).solve(solver.page, first.data as PuzzleData[PuzzleKind]);
  return { solver, other };
}

async function startFirstPuzzle(phones: Phone[]): Promise<void> {
  for (const { page } of phones) {
    await openTab(page, 'Today');
    await page.getByRole('button', { name: 'Got it' }).click();
    await expect(page.getByTestId('puzzle')).toBeVisible();
  }
}

test('Kennst-du-mich mit Auswahl: aufgedeckt wird erst nach beidseitiger Abgabe, ein Treffer bringt ein Herz, die Antworten hängen im Haus', async ({ browser }) => {
  if (choiceQuestion.answer.kind !== 'choice') throw new Error('Auswahlfrage erwartet');
  const [one, two] = choiceQuestion.answer.options as [string, string];
  const { a, b } = await pair(browser);
  await openTask([a, b], choiceQuestion.id);
  const choose = async (page: Page, own: string, guess: string) => {
    await page.getByTestId('knowme-own').getByRole('radio', { name: own, exact: true }).click();
    await page.getByTestId('knowme-guess').getByRole('radio', { name: guess, exact: true }).click();
    await page.getByRole('button', { name: 'Lock it in' }).click();
  };

  // Ada sagt die erste Option und tippt bei Bao richtig auf die zweite.
  await expect(a.page.getByRole('button', { name: 'Lock it in' })).toBeDisabled();
  await choose(a.page, one, two);
  await expect(a.page.getByTestId('task-waiting')).toBeVisible();
  await expect(reveal(a.page)).toHaveCount(0);

  // Bao erfährt nur, dass Ada abgegeben hat.
  await returnToApp(b.page);
  await expect(b.page.getByTestId('partner-in')).toContainText('Ada');
  await expect(reveal(b.page)).toHaveCount(0);
  await expect(progress(b.page)).toHaveText(new RegExp(`^${done(choiceQuestion.id)} of `));

  // Bao sagt die zweite Option und tippt bei Ada daneben.
  await choose(b.page, two, two);
  await seeReveal(b.page);
  await expect(b.page.getByTestId('reveal-theirs')).toContainText(one);
  await expect(b.page.getByTestId('reveal-theirs').getByTestId('heart')).toHaveCount(0);
  await expect(b.page.getByTestId('reveal-mine').getByTestId('heart')).toHaveCount(1);

  await returnToApp(a.page);
  await seeReveal(a.page);
  await expect(a.page.getByTestId('reveal-theirs')).toContainText(two);
  await expect(a.page.getByTestId('reveal-theirs').getByTestId('heart')).toHaveCount(1);
  await expect(a.page.getByTestId('reveal-mine').getByTestId('heart')).toHaveCount(0);

  // Erledigt für beide; die Antworten bleiben als Erinnerungsstück im Haus lesbar.
  for (const { page } of [a, b]) {
    await expect(page.getByTestId('task-done')).toBeVisible();
    await expect(progress(page)).toHaveText(new RegExp(`^${done(choiceQuestion.id) + 1} of `));
  }
  await openTab(a.page, 'Home');
  await a.page.getByTestId('memory').last().click();
  const memory = a.page.getByRole('dialog');
  await expect(memory).toContainText(choiceQuestion.question);
  await expect(memory).toContainText(one);
  await expect(memory).toContainText(two);
  await expect(memory).toContainText('Ada guessed it right.');
});

test('frei getippte Antwort: Bis beide abgegeben haben, steht sie in keiner Antwort an den anderen; danach entscheidet, wer geantwortet hat, über das Herz', async ({ browser }) => {
  const { a, b } = await pair(browser);
  await openTask([a, b], textQuestion.id);
  const write = async (page: Page, own: string, guess: string) => {
    await page.getByTestId('knowme-own').locator('input').fill(own);
    await page.getByTestId('knowme-guess').locator('input').fill(guess);
    await page.getByRole('button', { name: 'Lock it in' }).click();
  };

  const seenByBao = recordResponses(b.page);
  await write(a.page, 'Bananas-7731', 'Rice-4402');
  await expect(a.page.getByTestId('task-waiting')).toBeVisible();
  await expect(taskCard(a.page)).toContainText('Bananas-7731');

  await returnToApp(b.page);
  await expect(b.page.getByTestId('partner-in')).toBeVisible();
  const before = (await seenByBao.texts()).join('\n');
  expect(before).toContain(textQuestion.id);
  expect(before).not.toContain('Bananas-7731');
  expect(before).not.toContain('Rice-4402');
  await expect(b.page.locator('body')).not.toContainText('Bananas-7731');

  // Bao gibt ab: aufgedeckt. Ada tippte "Rice-4402" – Bao findet, das zählt nicht.
  await write(b.page, 'Noodles-5518', 'Strawberries-9920');
  await seeReveal(b.page);
  await expect(b.page.getByTestId('reveal-theirs')).toContainText('Bananas-7731');
  await expect(b.page.getByTestId('reveal-mine')).toContainText('Rice-4402');
  await expect(reveal(b.page)).toContainText("Does Ada's guess count?");
  await reveal(b.page).getByRole('button', { name: 'Not quite' }).click();
  await expect(reveal(b.page).getByRole('button', { name: 'Not quite' })).toHaveCount(0);
  await expect(reveal(b.page).getByTestId('heart')).toHaveCount(0);

  // Ada findet: "Strawberries-9920" zählt. Das Herz bekommt Bao.
  await returnToApp(a.page);
  await seeReveal(a.page);
  await expect(a.page.getByTestId('reveal-mine')).toContainText('Strawberries-9920');
  await reveal(a.page).getByRole('button', { name: 'Yes, that counts' }).click();
  await expect(a.page.getByTestId('reveal-mine').getByTestId('heart')).toHaveCount(1);
  await expect(a.page.getByTestId('reveal-theirs').getByTestId('heart')).toHaveCount(0);

  await returnToApp(b.page);
  await expect(b.page.getByTestId('reveal-theirs').getByTestId('heart')).toHaveCount(1);
  await expect(progress(b.page)).toHaveText(new RegExp(`^${done(textQuestion.id) + 1} of `));
});

test('eine halb getippte Antwort ist gesichert, bevor das Feld verlassen wird – sie übersteht, dass iOS die App beendet', async ({ browser }) => {
  const { a, b } = await pair(browser);
  await openTask([a, b], textQuestion.id);
  const own = () => a.page.getByTestId('knowme-own').locator('input');
  await own().pressSequentially('Half a thou');
  // Das Feld hat noch den Fokus – verlassen wurde es nie.
  await expect(own()).toBeFocused();

  // Was das Gerät in seiner lokalen Datenbank gesichert hat (src/lib/store.ts).
  const saved = () =>
    a.page.evaluate(
      () =>
        new Promise<unknown>((resolve) => {
          const open = indexedDB.open('paartrip');
          open.onsuccess = () => {
            const request = open.result.transaction('kv').objectStore('kv').get('settings');
            request.onsuccess = () => {
              open.result.close();
              resolve((request.result as { draft?: { value?: { own?: unknown } } } | undefined)?.draft?.value?.own ?? null);
            };
          };
        }),
    );
  await expect.poll(saved).toBe('Half a thou');

  // iOS beendet die App beim Wechsel in den Messenger; beim nächsten Öffnen steht das Getippte wieder da.
  await a.page.reload();
  await openTab(a.page, 'Today');
  await expect(own()).toHaveValue('Half a thou');
});

test('Aufgabe im echten Leben für einen: Erledigt ist sie erst, wenn der andere den Erhalt bestätigt', async ({ browser }) => {
  if (forOne.doer === 'both') throw new Error('Aufgabe für einen erwartet');
  const { a, b } = await pair(browser);
  await openTask([a, b], forOne.id);
  const doer = forOne.doer === 'a' ? a : b;
  const receiver = forOne.doer === 'a' ? b : a;

  for (const { page } of [a, b]) await expect(taskCard(page)).toContainText(forOne.text);
  // Wer sie ausführt, hat nichts zu bestätigen.
  await expect(doer.page.getByRole('button', { name: 'It arrived' })).toHaveCount(0);
  await expect(taskCard(doer.page)).toContainText('yours to do');

  await receiver.page.getByRole('button', { name: 'It arrived' }).click();
  await expect(receiver.page.getByTestId('task-done')).toBeVisible();
  await returnToApp(doer.page);
  for (const { page } of [a, b]) {
    await expect(page.getByTestId('task-done')).toBeVisible();
    await expect(progress(page)).toHaveText(new RegExp(`^${done(forOne.id) + 1} of `));
  }
});

test('Aufgabe im echten Leben für beide: Beide bestätigen', async ({ browser }) => {
  const { a, b } = await pair(browser);
  await openTask([a, b], forBoth.id);

  await a.page.getByRole('button', { name: 'It arrived' }).click();
  await expect(a.page.getByTestId('task-waiting')).toContainText('Bao');
  await expect(a.page.getByTestId('task-done')).toHaveCount(0);

  await returnToApp(b.page);
  await expect(b.page.getByTestId('partner-confirmed')).toContainText('Ada');
  await expect(progress(b.page)).toHaveText(new RegExp(`^${done(forBoth.id)} of `));
  await b.page.getByRole('button', { name: 'It arrived' }).click();

  await expect(b.page.getByTestId('task-done')).toBeVisible();
  await returnToApp(a.page);
  await expect(a.page.getByTestId('task-done')).toBeVisible();
  await expect(progress(a.page)).toHaveText(new RegExp(`^${done(forBoth.id) + 1} of `));
});

test('Tagesregel mit gestellter Uhr: Die nächste Aufgabe erscheint erst am folgenden Kalendertag', async ({ browser }) => {
  const day = '2027-03-01';
  const berlin = (date: string, time: string) => new Date(`${date}T${time}+01:00`).toISOString();
  const { a, b } = await pair(browser, { now: berlin(day, '09:00:00') });
  await startFirstPuzzle([a, b]);
  await solveFirstPuzzle(a, b);

  // Am selben Tag bleibt es bei "erledigt" – auch kurz vor Mitternacht.
  await setClock([a, b], berlin(day, '23:55:00'));
  for (const { page } of [a, b]) {
    await returnToApp(page);
    await expect(page.getByTestId('task-done')).toContainText('tomorrow');
    await expect(taskCard(page)).toHaveCount(0);
    await expect(progress(page)).toHaveText(/^1 of /);
  }

  // Kurz nach Mitternacht in Berlin ist die nächste da, auf beiden Geräten.
  await setClock([a, b], berlin(nextDay(day), '00:05:00'));
  for (const { page } of [a, b]) {
    await returnToApp(page);
    await expect(taskCard(page)).toHaveAttribute('data-task', chapter.taskOrder[1]!);
    await expect(page.getByTestId('task-done')).toHaveCount(0);
  }
});

test('offline: Ein Schritt wartet auf dem Gerät und kommt nach – der andere hängt derweil nicht fest', async ({ browser }) => {
  const { a, b } = await pair(browser);
  await startFirstPuzzle([a, b]);

  // Wer löst, hat gerade kein Netz: Die Lösung ist gesichert und wartet.
  const solverSlot = first.type === 'puzzle' && canSolve(first.kind, 'lead') ? first.lead : otherSlot(first.type === 'puzzle' ? first.lead : 'a');
  const offline = solverSlot === 'a' ? a : b;
  await offline.context.setOffline(true);
  const { solver, other } = await solveFirstPuzzle(a, b);
  expect(solver).toBe(offline);
  await expect(solver.page.getByTestId('task-sent')).toBeVisible();

  // Der andere sieht das Rätsel weiter offen und kann alles andere tun.
  await returnToApp(other.page);
  await openTab(other.page, 'Today');
  await expect(taskCard(other.page)).toBeVisible();
  await wrapGift(other.page, 'While you were away');
  await expect(giftsFromMe(other.page)).toHaveCount(1);

  // Zurück im Netz: Die Lösung kommt an und gilt für beide.
  await solver.context.setOffline(false);
  await returnToApp(solver.page);
  await expect(solver.page.getByTestId('task-done')).toBeVisible();
  await returnToApp(other.page);
  await openTab(other.page, 'Today');
  await expect(other.page.getByTestId('task-done')).toBeVisible();

  // Dasselbe bei einer Frage: Ada antwortet ohne Netz, Bao mit – aufgedeckt wird, sobald Adas Antwort ankommt.
  if (choiceQuestion.answer.kind !== 'choice') throw new Error('Auswahlfrage erwartet');
  const option = choiceQuestion.answer.options[0]!;
  await openTask([a, b], choiceQuestion.id);
  const answer = async (page: Page) => {
    await page.getByTestId('knowme-own').getByRole('radio', { name: option, exact: true }).click();
    await page.getByTestId('knowme-guess').getByRole('radio', { name: option, exact: true }).click();
    await page.getByRole('button', { name: 'Lock it in' }).click();
  };
  await a.context.setOffline(true);
  await answer(a.page);
  await expect(a.page.getByTestId('task-sent')).toBeVisible();
  await answer(b.page);
  await expect(b.page.getByTestId('task-waiting')).toBeVisible();
  await expect(reveal(b.page)).toHaveCount(0);

  await a.context.setOffline(false);
  await returnToApp(a.page);
  await seeReveal(a.page);
  await returnToApp(b.page);
  await seeReveal(b.page);
});
