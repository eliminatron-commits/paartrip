import { defineConfig, devices } from '@playwright/test';

const PORT = 4173;
const ORIGIN = `http://localhost:${PORT}`;
const URL = `${ORIGIN}/paartrip/`;
// Dieselbe Adresse schreibt e2e/build-versions.ts als VITE_API_URL in die Test-Builds.
const API_PORT = 8788;

export default defineConfig({
  testDir: 'e2e',
  forbidOnly: !!process.env.CI,
  // Zwei Geräte, mehrere Abgleiche: Einzelne Tests brauchen allein bis zu 27 s; unter Last risse die Vorgabe von 30 s.
  timeout: 60_000,
  reporter: 'list',
  use: {
    baseURL: URL,
    trace: 'retain-on-failure',
  },
  projects: [
    {
      // WebKit mit iPhone-Kennung; 440×956 entspricht den großen iPhones (Sichtprüfung laut Vorgabe).
      name: 'webkit-iphone',
      use: { ...devices['iPhone 15 Pro Max'], viewport: { width: 440, height: 956 } },
    },
  ],
  webServer: [
    {
      command: `node e2e/serve.ts dist-e2e/v1 ${PORT}`,
      url: URL,
      reuseExistingServer: !process.env.CI,
    },
    {
      // Der echte Worker, lokal gestartet, mit frischer Datenbank.
      command: `node e2e/api-server.ts ${API_PORT} ${ORIGIN}`,
      url: `http://localhost:${API_PORT}/`,
      reuseExistingServer: !process.env.CI,
    },
  ],
});
