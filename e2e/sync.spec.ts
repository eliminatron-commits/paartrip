// Zwei Geräte gegen den lokal gestarteten Worker: je Gerät ein eigener Browser-Kontext mit eigenem Speicher.
import { readFile } from 'node:fs/promises';
import { type Browser, type BrowserContext, expect, type Page, test } from '@playwright/test';

interface Phone {
  context: BrowserContext;
  page: Page;
}

const phones: BrowserContext[] = [];

async function phone(browser: Browser): Promise<Phone> {
  const context = await browser.newContext();
  phones.push(context);
  const page = await context.newPage();
  await page.goto('./');
  return { context, page };
}

test.afterEach(async () => {
  for (const context of phones.splice(0)) await context.close();
});

/** Rückkehr in die App: iOS lädt die Seite nicht neu, es meldet nur visibilitychange. */
const returnToApp = (page: Page) => page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));

async function startHouse(page: Page, name: string): Promise<string> {
  await page.getByLabel('Your first name').fill(name);
  await page.getByRole('button', { name: 'Open the door' }).click();
  const code = await page.getByTestId('pairing-code').innerText();
  expect(code).toMatch(/^[2-9A-Z]{4}-[2-9A-Z]{4}$/);
  return code;
}

async function moveIn(page: Page, name: string, code: string): Promise<void> {
  await page.getByRole('button', { name: 'I have a code' }).click();
  await page.getByLabel('Your first name').fill(name);
  await page.getByLabel('Code from your partner').fill(code);
  await page.getByRole('button', { name: 'Move in' }).click();
}

/** Ada (Gerät A) legt an, Bao (Gerät B) zieht ein. */
async function pair(browser: Browser): Promise<{ a: Phone; b: Phone; code: string }> {
  const a = await phone(browser);
  const code = await startHouse(a.page, 'Ada');
  const b = await phone(browser);
  await moveIn(b.page, 'Bao', code);
  await expect(b.page.getByTestId('house-names')).toHaveText('Bao & Ada');
  await returnToApp(a.page);
  await expect(a.page.getByTestId('house-names')).toHaveText('Ada & Bao');
  return { a, b, code };
}

async function wrapGift(page: Page, text: string): Promise<void> {
  await page.getByLabel('Your promise').fill(text);
  await page.getByRole('button', { name: 'Wrap it up' }).click();
}

// Geheime Gutscheine (die festen aus den Inhalten stehen in derselben Liste).
const giftsFromMe = (page: Page) => page.locator('[data-testid="gift"][data-kind="secret"][data-from="me"]');
const wrappedForMe = (page: Page) => page.locator('[data-testid="gift"][data-kind="secret"][data-from="partner"]');

test('zwei Geräte koppeln sich; ein dritter Beitritt wird abgelehnt', async ({ browser }) => {
  const a = await phone(browser);
  const code = await startHouse(a.page, 'Ada');
  await expect(a.page.getByTestId('house-names')).toHaveText('The door is open, Ada');

  // B tippt den Code klein und ohne Bindestrich.
  const b = await phone(browser);
  await moveIn(b.page, 'Bao', code.replace('-', '').toLowerCase());
  await expect(b.page.getByTestId('house-names')).toHaveText('Bao & Ada');
  await expect(b.page.getByTestId('pairing-status')).toContainText('Linked as Bao. You share the house with Ada.');

  // A erfährt es bei der Rückkehr in die App; der Code ist dann verschwunden.
  await returnToApp(a.page);
  await expect(a.page.getByTestId('house-names')).toHaveText('Ada & Bao');
  await expect(a.page.getByTestId('pairing-code')).toBeHidden();

  // Ein drittes Gerät kommt mit demselben Code nicht hinein.
  const c = await phone(browser);
  await moveIn(c.page, 'Cleo', code);
  await expect(c.page.getByRole('alert')).toHaveText('This house already has two people.');
  await expect(c.page.getByRole('heading', { name: 'Welcome home' })).toBeVisible();

  // Der Stand übersteht das Neuladen.
  await a.page.reload();
  await expect(a.page.getByTestId('house-names')).toHaveText('Ada & Bao');
  await expect(a.page.getByTestId('pairing-status')).toContainText('Linked as Ada.');
});

test('ein falscher Code öffnet kein Haus', async ({ browser }) => {
  const b = await phone(browser);
  await moveIn(b.page, 'Bao', 'ZZZZ-ZZZZ');
  await expect(b.page.getByRole('alert')).toHaveText("That code doesn't open a house. Check it with your partner.");
});

test('eine Aktion von A erscheint bei B nach dem Abgleich – der Text bleibt für B verborgen', async ({ browser }) => {
  const { a, b } = await pair(browser);
  const secret = 'Breakfast in bed 4711';

  // Alles mitlesen, was der Server an Gerät B schickt.
  const sentToB: string[] = [];
  b.page.on('response', async (response) => {
    if (response.url().includes(':8788/')) sentToB.push(await response.text().catch(() => ''));
  });

  await wrapGift(a.page, secret);
  await expect(giftsFromMe(a.page)).toHaveText([new RegExp(`^${secret}`)]);
  await expect(a.page.getByTestId('sync-status')).toHaveText('Up to date.');

  // B hat noch nichts davon – erst die Rückkehr in die App gleicht ab.
  await expect(wrappedForMe(b.page)).toHaveCount(0);
  await returnToApp(b.page);
  await expect(wrappedForMe(b.page)).toHaveCount(1);
  await expect(wrappedForMe(b.page)).toContainText('A wrapped gift from Ada');

  // Der Text ist weder zu sehen noch je bei B angekommen.
  await expect(b.page.getByText(secret)).toHaveCount(0);
  expect(sentToB.length).toBeGreaterThan(0);
  expect(sentToB.join('\n')).not.toContain(secret);
  expect(sentToB.join('\n')).toContain('"veiled"');
});

test('eine offline erzeugte Aktion wird nachgereicht', async ({ browser }) => {
  const { a, b } = await pair(browser);
  // Der Service Worker muss die Seite steuern, damit sie ohne Netz neu lädt.
  await a.page.waitForFunction(() => navigator.serviceWorker.controller !== null);

  await a.context.setOffline(true);
  await wrapGift(a.page, 'Made without a signal');
  await expect(a.page.getByTestId('sync-status')).toHaveText('Offline. 1 change waiting to be sent.');
  // Nichts wird vorauseilend angezeigt: Was gilt, sagt der Server.
  await expect(giftsFromMe(a.page)).toHaveCount(0);

  // Die App wird ohne Netz beendet und neu geöffnet: Haus und wartende Aktion sind noch da.
  await a.page.reload();
  await expect(a.page.getByTestId('house-names')).toHaveText('Ada & Bao');
  await expect(a.page.getByTestId('sync-status')).toHaveText('Offline. 1 change waiting to be sent.');

  await a.context.setOffline(false);
  await returnToApp(a.page);
  await expect(a.page.getByTestId('sync-status')).toHaveText('Up to date.');
  await expect(giftsFromMe(a.page)).toHaveText([/^Made without a signal/]);

  await returnToApp(b.page);
  await expect(wrappedForMe(b.page)).toHaveCount(1);
});

test('Export und Import: nach geleertem Speicher dieselbe Rolle im selben Haus', async ({ browser }) => {
  const { a, b } = await pair(browser);
  await wrapGift(a.page, 'Before the new phone');
  await expect(giftsFromMe(a.page)).toHaveCount(1);

  const [download] = await Promise.all([a.page.waitForEvent('download'), a.page.getByRole('button', { name: 'Save a backup file' }).click()]);
  expect(download.suggestedFilename()).toMatch(/^paartrip-backup-\d{4}-\d{2}-\d{2}\.json$/);
  const file = { name: download.suggestedFilename(), mimeType: 'application/json', buffer: await readFile(await download.path()) };

  // Neues Telefon: leerer Speicher, nichts gekoppelt.
  const fresh = await phone(browser);
  await expect(fresh.page.getByRole('heading', { name: 'Welcome home' })).toBeVisible();
  await fresh.page.getByLabel('Backup file').setInputFiles(file);

  // Dieselbe Rolle (Ada, Spielerin a) im selben Haus – samt dem, was nur sie sehen darf.
  await expect(fresh.page.getByTestId('house-names')).toHaveText('Ada & Bao');
  await expect(fresh.page.getByTestId('pairing-status')).toContainText('Linked as Ada.');
  await expect(giftsFromMe(fresh.page)).toHaveText([/^Before the new phone/]);

  // Das wiederhergestellte Gerät kann handeln: Sein Gutschein kommt bei B an.
  await wrapGift(fresh.page, 'From the new phone');
  await expect(giftsFromMe(fresh.page)).toHaveCount(2);
  await returnToApp(b.page);
  await expect(wrappedForMe(b.page)).toHaveCount(2);

  // Auf einem schon gekoppelten Gerät fragt der Import erst nach.
  await b.page.getByLabel('Backup file').setInputFiles(file);
  await expect(b.page.getByText("Replace what's on this phone with the backup?")).toBeVisible();
  await b.page.getByRole('button', { name: 'Cancel' }).click();
  await expect(b.page.getByTestId('pairing-status')).toContainText('Linked as Bao.');
});

test('eine fremde Datei wird beim Import abgelehnt', async ({ browser }) => {
  const fresh = await phone(browser);
  await fresh.page.getByLabel('Backup file').setInputFiles({ name: 'notes.json', mimeType: 'application/json', buffer: Buffer.from('{"hello":"world"}') });
  await expect(fresh.page.getByTestId('restore-result')).toHaveText("This doesn't look like a PaarTrip backup file.");
  await expect(fresh.page.getByRole('heading', { name: 'Welcome home' })).toBeVisible();
});
