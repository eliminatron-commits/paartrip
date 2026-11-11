// Startet den statischen Testserver: node e2e/serve.ts <Build-Ordner> <Port>
import { startStaticServer } from './static-server.ts';

const server = await startStaticServer(process.argv[2] ?? 'dist-e2e/v1', Number(process.argv[3] ?? 4173));
console.log(`Testserver läuft auf ${server.url}`);
