// Zwei Geräte gegen den lokal gestarteten Worker: Koppeln, Abgleich, Offline-Warteschlange, Export und Import.
import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import {
  closePhones,
  closeSettings,
  giftsForMe,
  giftsFromMe,
  LOCAL_API,
  moveIn,
  openSettings,
  openTab,
  pair,
  phone,
  recordResponses,
  returnToApp,
  startHouse,
  syncStatus,
  wrapGift,
} from './phones.ts';

test.afterEach(closePhones);

test('zwei Geräte koppeln sich; ein dritter Beitritt wird abgelehnt', async ({ browser }) => {
  const a = await phone(browser);
  const code = await startHouse(a.page, 'Ada');
  await expect(a.page.getByTestId('house-names')).toHaveText('The door is open, Ada');

  // B tippt den Code klein und ohne Bindestrich.
  const b = await phone(browser);
  await moveIn(b.page, 'Bao', code.replace('-', '').toLowerCase());
  await expect(b.page.getByTestId('house-names')).toHaveText('Bao & Ada');
  await openSettings(b.page);
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
  await openSettings(a.page);
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
  const sentToB = recordResponses(b.page);

  await wrapGift(a.page, secret);
  await expect(giftsFromMe(a.page)).toHaveText([new RegExp(`^\\s*${secret}`)]);
  await expect(syncStatus(a.page)).toHaveText('Up to date.');

  // B hat noch nichts davon – erst die Rückkehr in die App gleicht ab.
  await openTab(b.page, 'Gifts');
  await expect(giftsForMe(b.page)).toHaveCount(0);
  await returnToApp(b.page);
  await expect(giftsForMe(b.page)).toHaveCount(1);
  await expect(giftsForMe(b.page)).toContainText('A wrapped gift from Ada');

  // Der Text ist weder zu sehen noch je bei B angekommen.
  await expect(b.page.getByText(secret)).toHaveCount(0);
  await expect(syncStatus(b.page)).toHaveText('Up to date.');
  const received = await sentToB.texts();
  expect(received.length).toBeGreaterThan(0);
  expect(received.join('\n')).not.toContain(secret);
  expect(received.join('\n')).toContain('"veiled"');
});

test('"Refresh" in der Kopfleiste holt den Schritt des anderen, ohne dass die App verlassen wird', async ({ browser }) => {
  const { a, b } = await pair(browser);
  await openTab(b.page, 'Gifts');
  await wrapGift(a.page, 'A walk by the river');
  await expect(syncStatus(a.page)).toHaveText('Up to date.');

  // B hat die App die ganze Zeit offen und erfährt von selbst nichts.
  await expect(giftsForMe(b.page)).toHaveCount(0);
  const refresh = b.page.getByRole('button', { name: 'Refresh' });
  await refresh.click();
  // Der Knopf zeigt, dass er holt, und ist danach wieder frei.
  await expect(refresh).toHaveAttribute('aria-busy', 'true');
  await expect(giftsForMe(b.page)).toHaveCount(1);
  await expect(refresh).toHaveAttribute('aria-busy', 'false');
  await expect(syncStatus(b.page)).toHaveText('Up to date.');

  // Ohne Netz sagt der Streifen darunter, woran es liegt.
  await b.context.setOffline(true);
  await refresh.click();
  await expect(syncStatus(b.page)).toHaveText('Offline. Showing what was saved last.');
  await expect(syncStatus(b.page)).toBeInViewport();

  // Solange kein Haus da ist, gibt es nichts zu holen.
  const c = await phone(browser);
  await expect(c.page.getByRole('heading', { name: 'Welcome home' })).toBeVisible();
  await expect(c.page.getByRole('button', { name: 'Refresh' })).toHaveCount(0);
});

test('eine offline erzeugte Aktion wird nachgereicht', async ({ browser }) => {
  const { a, b } = await pair(browser);
  // Der Service Worker muss die Seite steuern, damit sie ohne Netz neu lädt.
  await a.page.waitForFunction(() => navigator.serviceWorker.controller !== null);

  await a.context.setOffline(true);
  await wrapGift(a.page, 'Made without a signal');
  await expect(syncStatus(a.page)).toHaveText('Offline. 1 change waiting to be sent.');
  await expect(syncStatus(a.page)).toBeInViewport();
  // Nichts wird vorauseilend angezeigt: Was gilt, sagt der Server.
  await expect(giftsFromMe(a.page)).toHaveCount(0);

  // Die App wird ohne Netz beendet und neu geöffnet: Haus und wartende Aktion sind noch da.
  await a.page.reload();
  await expect(a.page.getByTestId('house-names')).toHaveText('Ada & Bao');
  await expect(syncStatus(a.page)).toHaveText('Offline. 1 change waiting to be sent.');

  await a.context.setOffline(false);
  await returnToApp(a.page);
  await expect(syncStatus(a.page)).toHaveText('Up to date.');
  await openTab(a.page, 'Gifts');
  await expect(giftsFromMe(a.page)).toHaveText([/^\s*Made without a signal/]);

  await openTab(b.page, 'Gifts');
  await returnToApp(b.page);
  await expect(giftsForMe(b.page)).toHaveCount(1);
});

test('kennt der Server das Gerät nicht mehr, führt "Start over" zurück zum Anfang', async ({ browser, request }) => {
  const a = await phone(browser);
  const code = await startHouse(a.page, 'Ada');
  await expect(a.page.getByRole('button', { name: 'Start over' })).toBeHidden();

  // Der Server vergisst das Haus samt Gerät, so als wäre die Datenbank zurückgesetzt worden
  // (Hilfsroute des lokalen Testservers, siehe e2e/api-server.ts).
  const forgotten = await request.post(`${LOCAL_API}/__test/forget-house?code=${code.replace('-', '')}`);
  expect(forgotten.status()).toBe(204);
  await returnToApp(a.page);
  await expect(syncStatus(a.page)).toHaveText("This phone isn't linked to the house anymore.");

  // Erst nach der Rückfrage wird die Kopplung gelöst.
  await a.page.getByRole('button', { name: 'Start over' }).click();
  await a.page.getByRole('button', { name: 'Cancel' }).click();
  await expect(a.page.getByTestId('house-names')).toHaveText('The door is open, Ada');
  await a.page.getByRole('button', { name: 'Start over' }).click();
  await a.page.getByRole('button', { name: 'Yes, start over' }).click();
  await expect(a.page.getByRole('heading', { name: 'Welcome home' })).toBeVisible();

  // Das Gerät ist frei, auch nach dem Neuladen, und kann ein neues Haus anlegen.
  await a.page.reload();
  await expect(a.page.getByRole('heading', { name: 'Welcome home' })).toBeVisible();
  await startHouse(a.page, 'Ada');
  await expect(syncStatus(a.page)).toHaveText('Up to date.');
});

test('Export und Import: nach geleertem Speicher dieselbe Rolle im selben Haus', async ({ browser }) => {
  const { a, b } = await pair(browser);
  await wrapGift(a.page, 'Before the new phone');
  await expect(giftsFromMe(a.page)).toHaveCount(1);

  await openSettings(a.page);
  const [download] = await Promise.all([a.page.waitForEvent('download'), a.page.getByRole('button', { name: 'Save a backup file' }).click()]);
  expect(download.suggestedFilename()).toMatch(/^paartrip-backup-\d{4}-\d{2}-\d{2}\.json$/);
  const file = { name: download.suggestedFilename(), mimeType: 'application/json', buffer: await readFile(await download.path()) };

  // Neues Telefon: leerer Speicher, nichts gekoppelt.
  const fresh = await phone(browser);
  await expect(fresh.page.getByRole('heading', { name: 'Welcome home' })).toBeVisible();
  await fresh.page.getByLabel('Backup file').setInputFiles(file);

  // Dieselbe Rolle (Ada, Spielerin a) im selben Haus – samt dem, was nur sie sehen darf.
  await expect(fresh.page.getByTestId('house-names')).toHaveText('Ada & Bao');
  await openSettings(fresh.page);
  await expect(fresh.page.getByTestId('pairing-status')).toContainText('Linked as Ada.');
  await closeSettings(fresh.page);
  await openTab(fresh.page, 'Gifts');
  await expect(giftsFromMe(fresh.page)).toHaveText([/^\s*Before the new phone/]);

  // Das wiederhergestellte Gerät kann handeln: Sein Gutschein kommt bei B an.
  await wrapGift(fresh.page, 'From the new phone');
  await expect(giftsFromMe(fresh.page)).toHaveCount(2);
  await openTab(b.page, 'Gifts');
  await returnToApp(b.page);
  await expect(giftsForMe(b.page)).toHaveCount(2);

  // Auf einem schon gekoppelten Gerät fragt der Import erst nach.
  await openSettings(b.page);
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
