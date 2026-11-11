// Baut die App zweimal nach dist-e2e/ – wie zwei aufeinanderfolgende Deploys mit verschiedenen Commits.
// Der Update-Test tauscht v1 gegen v2 aus und erwartet den Update-Hinweis.
import { execSync } from 'node:child_process';

const VERSIONS = { v1: 'e2e0001', v2: 'e2e0002' };

for (const [dir, sha] of Object.entries(VERSIONS)) {
  execSync(`npx vite build --outDir dist-e2e/${dir} --emptyOutDir --logLevel warn`, {
    stdio: 'inherit',
    env: { ...process.env, GITHUB_SHA: sha },
  });
}
console.log('E2E-Builds fertig: dist-e2e/v1, dist-e2e/v2');
