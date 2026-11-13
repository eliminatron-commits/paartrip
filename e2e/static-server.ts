// Kleiner statischer Server für die E2E-Tests. Er liefert einen Build unter /paartrip/ aus wie GitHub Pages
// (auch mit dessen Cache-Control) und kann im laufenden Betrieb auf einen anderen Build umschalten –
// so lässt sich ein zweiter Deploy nachstellen.
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, resolve, sep } from 'node:path';

export const BASE = '/paartrip/';

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
  // Wie GitHub Pages: die Lieder unter public/music.
  '.m4a': 'audio/mp4',
};

export interface StaticServer {
  url: string;
  /** Tauscht den ausgelieferten Build aus ("Deploy"). */
  deploy(dir: string): void;
  close(): Promise<void>;
}

export function startStaticServer(dir: string, port: number): Promise<StaticServer> {
  let root = resolve(dir);

  const server = createServer((req, res) => {
    const path = decodeURIComponent(new URL(req.url ?? '/', 'http://localhost').pathname);
    const file = resolve(root, path.startsWith(BASE) ? path.slice(BASE.length) || 'index.html' : '\0');
    if (!path.startsWith(BASE) || !file.startsWith(root + sep)) {
      res.writeHead(404).end();
      return;
    }
    readFile(file).then(
      (body) => {
        res.writeHead(200, {
          'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream',
          'Cache-Control': 'max-age=600',
        });
        res.end(body);
      },
      () => res.writeHead(404).end(),
    );
  });

  return new Promise((done) => {
    server.listen(port, () => {
      done({
        url: `http://localhost:${port}${BASE}`,
        deploy(next) {
          root = resolve(next);
        },
        close: () => new Promise((closed) => server.close(() => closed())),
      });
    });
  });
}
