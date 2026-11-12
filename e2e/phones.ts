// Gemeinsame Handgriffe der Zwei-Geräte-Tests: je Gerät ein eigener Browser-Kontext mit eigenem Speicher,
// alle gegen den lokal gestarteten Worker.
import { type Browser, type BrowserContext, expect, type Locator, type Page } from '@playwright/test';

export interface Phone {
  context: BrowserContext;
  page: Page;
  /** Kopplungscode des Hauses (ohne Bindestrich), sobald das Gerät gekoppelt ist – für die Hilfsrouten des Testservers. */
  code?: string;
}

/** Der lokal gestartete Worker (Port wie in playwright.config.ts und e2e/build-versions.ts). */
export const LOCAL_API = 'http://localhost:8788';

export interface SafeArea {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

/** Safe Area der großen iPhones im Hochformat: oben Uhr und Dynamic Island, unten der Home-Indikator. */
export const SAFE_AREA: SafeArea = { top: 59, right: 0, bottom: 34, left: 0 };
/** Im Querformat liegen Dynamic Island und Rundungen an den Seiten, der Home-Indikator unten. */
export const SAFE_AREA_LANDSCAPE: SafeArea = { top: 0, right: 59, bottom: 21, left: 59 };

export interface PhoneOptions {
  /** Stellt die Ränder eines echten iPhones nach. */
  safeArea?: SafeArea;
  /** Gestellte Serverzeit von Anfang an (siehe `setClock`). */
  now?: string;
}

/**
 * Stellt die Uhr des Servers für diese Geräte: Jede ihrer Anfragen trägt den Kopf X-Test-Now, den der lokale
 * Worker als Serverzeit nimmt. Andere Tests, die gleichzeitig laufen, merken davon nichts.
 */
export async function setClock(phones: Phone[], now: string): Promise<void> {
  for (const { context } of phones) await context.setExtraHTTPHeaders({ 'X-Test-Now': now });
}

const open: BrowserContext[] = [];

/** Neues Gerät mit leerem Speicher. */
export async function phone(browser: Browser, options: PhoneOptions = {}): Promise<Phone> {
  const context = await browser.newContext();
  open.push(context);
  if (options.now) await context.setExtraHTTPHeaders({ 'X-Test-Now': options.now });
  if (options.safeArea) {
    // Desktop-Browser kennen env(safe-area-inset-*) nur als 0; die App liest die Ränder deshalb aus diesen Variablen.
    await context.addInitScript((area) => {
      const apply = () => {
        const style = document.createElement('style');
        style.textContent = `:root{--safe-top:${area.top}px !important;--safe-right:${area.right}px !important;--safe-bottom:${area.bottom}px !important;--safe-left:${area.left}px !important}`;
        document.documentElement.append(style);
      };
      // Das Skript läuft, bevor es ein Dokument gibt: warten, bis das Wurzelelement da ist.
      if (document.documentElement) apply();
      else {
        const watcher = new MutationObserver(() => {
          if (!document.documentElement) return;
          watcher.disconnect();
          apply();
        });
        watcher.observe(document, { childList: true });
      }
    }, options.safeArea);
  }
  const page = await context.newPage();
  await page.goto('./');
  return { context, page };
}

/** Nach jedem Test aufrufen (test.afterEach). */
export async function closePhones(): Promise<void> {
  for (const context of open.splice(0)) await context.close();
}

/** Rückkehr in die App: iOS lädt die Seite nicht neu, es meldet nur visibilitychange. Danach wird abgeglichen. */
export async function returnToApp(page: Page): Promise<void> {
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
}

export async function startHouse(page: Page, name: string): Promise<string> {
  await page.getByLabel('Your first name').fill(name);
  await page.getByRole('button', { name: 'Open the door' }).click();
  const code = await page.getByTestId('pairing-code').innerText();
  expect(code).toMatch(/^[2-9A-Z]{4}-[2-9A-Z]{4}$/);
  return code;
}

export async function moveIn(page: Page, name: string, code: string): Promise<void> {
  await page.getByRole('button', { name: 'I have a code' }).click();
  await page.getByLabel('Your first name').fill(name);
  await page.getByLabel('Code from your partner').fill(code);
  await page.getByRole('button', { name: 'Move in' }).click();
}

/** Ada (Gerät A) legt an, Bao (Gerät B) zieht ein. */
export async function pair(browser: Browser, options: PhoneOptions = {}): Promise<{ a: Phone; b: Phone; code: string }> {
  const a = await phone(browser, options);
  const code = await startHouse(a.page, 'Ada');
  const b = await phone(browser, options);
  await moveIn(b.page, 'Bao', code);
  await expect(b.page.getByTestId('house-names')).toHaveText('Bao & Ada');
  await returnToApp(a.page);
  await expect(a.page.getByTestId('house-names')).toHaveText('Ada & Bao');
  a.code = b.code = code.replace('-', '');
  return { a, b, code };
}

// ---------------------------------------------------------------- Navigation

export type TabName = 'Home' | 'Today' | 'Gifts';

export async function openTab(page: Page, name: TabName): Promise<void> {
  await page.getByRole('navigation', { name: 'Main' }).getByRole('button', { name }).click();
}

export async function openSettings(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Settings', level: 2 })).toBeVisible();
}

export async function closeSettings(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Close settings' }).click();
}

/** Der Stand des Abgleichs – auch dann lesbar, wenn der Streifen nicht zu sehen ist. */
export const syncStatus = (page: Page): Locator => page.getByTestId('sync-status');

/**
 * Liest alles mit, was der Server an dieses Gerät schickt. `texts()` wartet, bis jede bis dahin begonnene
 * Antwort ganz gelesen ist – sonst könnte gerade die letzte in einer Prüfung fehlen.
 */
export function recordResponses(page: Page): { texts(): Promise<string[]> } {
  const reading: Promise<string>[] = [];
  page.on('response', (response) => {
    if (response.url().startsWith(LOCAL_API)) reading.push(response.text().catch(() => ''));
  });
  return { texts: () => Promise.all(reading) };
}

// ---------------------------------------------------------------- Geschenke

export async function wrapGift(page: Page, text: string): Promise<void> {
  await openTab(page, 'Gifts');
  await page.getByLabel('Your promise').fill(text);
  await page.getByRole('button', { name: 'Wrap it up' }).click();
}

// Geheime Gutscheine (die festen aus den Inhalten stehen in denselben Listen).
export const giftsFromMe = (page: Page): Locator => page.locator('[data-testid="gift"][data-kind="secret"][data-from="me"]');
export const giftsForMe = (page: Page): Locator => page.locator('[data-testid="gift"][data-kind="secret"][data-from="partner"]');

// ---------------------------------------------------------------- Haus

/** Ruft eine Hilfsroute des Testservers für das Haus dieses Geräts auf (e2e/api-server.ts). */
async function testRoute(phone: Phone, name: string, query = ''): Promise<void> {
  if (!phone.code) throw new Error('Gerät ist nicht gekoppelt');
  const reply = await phone.page.request.post(`${LOCAL_API}/__test/${name}?code=${phone.code}${query}`);
  expect(reply.status(), `Hilfsroute ${name}`).toBe(204);
}

/**
 * Erledigt die nächste Aufgabe auf dem Server so, wie zwei Spieler es täten (ohne einen Tag zu warten),
 * und wartet, bis dieses Gerät den neuen Stand hat. Für Tests, denen es um das geht, was danach kommt.
 */
export async function finishTask(phone: Phone): Promise<void> {
  await openTab(phone.page, 'Today');
  const progress = phone.page.getByTestId('today-progress');
  const before = Number((await progress.innerText()).split(' ')[0]);
  await testRoute(phone, 'finish-task');
  await returnToApp(phone.page);
  await expect(progress).toHaveText(new RegExp(`^${before + 1} of `));
}

/** Lässt die nächste Aufgabe erscheinen, als wäre ein Tag vergangen. Die Geräte gleichen danach selbst ab (`returnToApp`). */
export const nextTask = (phone: Phone): Promise<void> => testRoute(phone, 'next-task');

/**
 * Liegt eine Meilenstein-Szene über der App, öffnet das Geschenk und geht weiter, ohne etwas damit zu tun.
 * Tut nichts, wenn keine da ist.
 */
export async function passMilestone(page: Page): Promise<void> {
  const scene = page.getByTestId('milestone');
  if (!(await scene.isVisible())) return;
  const gift = scene.getByRole('button', { name: 'Open the gift' });
  if (await gift.isVisible()) await gift.click();
  await scene.getByRole('button', { name: /^(Later|Continue)$/ }).click();
}

/** Spielt auf dem Server so weit, bis diese Aufgabe die laufende ist, und zeigt sie auf beiden Geräten. */
export async function openTask(phones: Phone[], taskId: string): Promise<void> {
  await testRoute(phones[0]!, 'open-task', `&task=${taskId}`);
  for (const { page } of phones) {
    await returnToApp(page);
    // Der Abgleich läuft noch; unterwegs erreichte Meilensteine zeigen erst ihre Szene.
    await expect(async () => {
      await passMilestone(page);
      await page.getByRole('navigation', { name: 'Main' }).getByRole('button', { name: 'Today' }).click({ timeout: 1000 });
      await expect(page.locator(`[data-testid="task"][data-task="${taskId}"]`)).toBeVisible({ timeout: 1000 });
    }).toPass();
  }
}

/** Die Karte der laufenden, offenen Aufgabe (Today). */
export const taskCard = (page: Page): Locator => page.getByTestId('task');

/** Die Karte mit dem nächsten Schritt im Haus (Home). */
export const moveCard = (page: Page): Locator => page.getByTestId('move');

/** Ein Stück, das im Haus steht. */
export const pieceInHouse = (page: Page, pieceId: string): Locator => page.locator(`svg[data-piece="${pieceId}"]`);
