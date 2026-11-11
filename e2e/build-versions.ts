// Baut die App zweimal nach dist-e2e/ – wie zwei aufeinanderfolgende Deploys mit verschiedenen Commits.
// Der Update-Test tauscht v1 gegen v2 aus und erwartet den Update-Hinweis.
// Beide Builds sprechen den lokal gestarteten Worker an (Port wie in playwright.config.ts).
import { execSync } from 'node:child_process';

const VERSIONS = { v1: 'e2e0001', v2: 'e2e0002' };
const API_URL = 'http://localhost:8788';

for (const [dir, sha] of Object.entries(VERSIONS)) {
  execSync(`npx vite build --outDir dist-e2e/${dir} --emptyOutDir --logLevel warn`, {
    stdio: 'inherit',
    env: { ...process.env, GITHUB_SHA: sha, VITE_API_URL: API_URL },
  });
}
console.log('E2E-Builds fertig: dist-e2e/v1, dist-e2e/v2');
