import { defineConfig, devices } from '@playwright/test';

const PORT = 4173;
const URL = `http://localhost:${PORT}/paartrip/`;

export default defineConfig({
  testDir: 'e2e',
  forbidOnly: !!process.env.CI,
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
  webServer: {
    command: `node e2e/serve.ts dist-e2e/v1 ${PORT}`,
    url: URL,
    reuseExistingServer: !process.env.CI,
  },
});
