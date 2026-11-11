import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { VitePWA } from 'vite-plugin-pwa';
import { loadEnv } from 'vite';
import { defineConfig } from 'vitest/config';

// Repo-Pfad auf GitHub Pages: https://<user>.github.io/paartrip/
// base, scope und start_url müssen übereinstimmen, sonst laden Assets und Service Worker nicht.
const BASE = '/paartrip/';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string };

// Commit für die Versionszeile: im Workflow aus GITHUB_SHA, lokal aus Git.
function commit(): string {
  if (process.env.GITHUB_SHA) return process.env.GITHUB_SHA.slice(0, 7);
  try {
    return execSync('git rev-parse --short=7 HEAD', { stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim();
  } catch {
    return 'local';
  }
}

export default defineConfig(({ command, mode }) => {
  // Ohne Adresse des Workers wäre ein veröffentlichter Build nutzlos – lieber gar nicht bauen.
  if (command === 'build' && !loadEnv(mode, process.cwd(), 'VITE_').VITE_API_URL) {
    throw new Error('VITE_API_URL fehlt: Adresse des Workers in .env.production eintragen oder als Umgebungsvariable setzen.');
  }
  return {
    base: BASE,
    define: {
      // Die Build-Zeit macht jeden Build byteweise neu – so erkennt der Browser jeden Deploy als Update.
      __APP_VERSION__: JSON.stringify(pkg.version),
      __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
      __COMMIT__: JSON.stringify(commit()),
    },
    plugins: [
      svelte(),
      // In Vitest wird kein Service Worker gebaut.
      ...(process.env.VITEST
        ? []
        : [
            VitePWA({
              strategies: 'injectManifest',
              srcDir: 'src',
              filename: 'sw.ts',
              // Registrierung und Update-Ablauf steuert src/lib/update.svelte.ts von Hand.
              injectRegister: false,
              manifest: {
                id: BASE,
                name: 'Nhà Mình – PaarTrip',
                short_name: 'PaarTrip',
                description: 'A little house the two of you build together.',
                lang: 'en',
                display: 'standalone',
                orientation: 'portrait',
                start_url: BASE,
                scope: BASE,
                theme_color: '#1F4E5A',
                background_color: '#FAF3E7',
                icons: [
                  { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
                  { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
                  { src: 'icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
                ],
              },
              injectManifest: {
                rollupFormat: 'iife',
                globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
              },
            }),
          ]),
    ],
    test: {
      include: ['shared/**/*.test.ts', 'src/**/*.test.ts', 'scripts/**/*.test.ts', 'worker/**/*.test.ts'],
    },
  };
});
