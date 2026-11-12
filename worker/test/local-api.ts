// Startet den echten Worker lokal (workerd über das Test-Geschirr von Wrangler) mit einer frischen,
// leeren D1. Von den Worker-Tests (Vitest), den Zwei-Geräte-Tests (Playwright) und `npm run dev:api` genutzt.
// VAPID-Schlüssel entstehen bei jedem Start neu – im Repo liegt kein Schlüssel.
import { createTestHarness, type TestHarness } from 'wrangler';

/** Der Ausschnitt der D1-Schnittstelle, den Tests brauchen, um Zustände herzustellen und nachzusehen. */
export interface TestDb {
  prepare(sql: string): {
    bind(...values: unknown[]): {
      run(): Promise<unknown>;
      first<T>(): Promise<T | null>;
      all<T>(): Promise<{ results: T[] }>;
    };
  };
}

export interface LocalApi {
  /** Adresse ohne Schrägstrich am Ende. */
  url: string;
  harness: TestHarness;
  vapid: { publicKey: string; privateKey: string };
  db(): Promise<TestDb>;
  close(): Promise<void>;
}

export async function generateVapidKeys(): Promise<{ publicKey: string; privateKey: string }> {
  const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const publicKey = Buffer.from(await crypto.subtle.exportKey('raw', pair.publicKey)).toString('base64url');
  const privateKey = (await crypto.subtle.exportKey('jwk', pair.privateKey)).d;
  if (!privateKey) throw new Error('privater Schlüssel fehlt');
  return { publicKey, privateKey };
}

export async function startLocalApi(options: { origin: string; vars?: Record<string, string> }): Promise<LocalApi> {
  const vapid = await generateVapidKeys();
  const harness = createTestHarness({
    workers: [
      {
        configPath: 'worker/wrangler.jsonc',
        vars: {
          ALLOWED_ORIGIN: options.origin,
          MAX_HOUSES: '10000',
          VAPID_PUBLIC_KEY: vapid.publicKey,
          // Der Push-Dienst der Tests ist ein lokaler Server.
          PUSH_HOSTS: '127.0.0.1',
          PUSH_TEST_DELAY_MS: '0',
          // Test-Aufgaben: Bauzug, Meilenstein und Gutscheine lassen sich so ohne Aufgabenablauf durchspielen.
          TEST_ACTIONS: '1',
          ...options.vars,
        },
        secrets: { VAPID_PRIVATE_KEY: vapid.privateKey },
      },
    ],
  });
  const { url } = await harness.listen();
  await harness.getWorker().applyD1Migrations('DB');
  return {
    url: url.origin,
    harness,
    vapid,
    db: async () => ((await harness.getWorker().getEnv()) as { DB: TestDb }).DB,
    close: () => harness.close(),
  };
}
