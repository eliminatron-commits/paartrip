// Startet den Worker lokal auf einem festen Port: node e2e/api-server.ts <Port> <Adresse der App>
// Fester Port, weil die Adresse des Workers beim Bauen in die App geschrieben wird; das Test-Geschirr
// von Wrangler wählt seinen Port selbst, also leitet dieser kleine Server dorthin weiter.
// Genutzt von den Zwei-Geräte-Tests (Playwright) und von `npm run dev:api`.
import { readFileSync } from 'node:fs';
import { createServer, request } from 'node:http';
import type { RulesContent } from '../shared/content-schema.ts';
import type { HouseState } from '../shared/model.ts';
import { startLocalApi } from '../worker/test/local-api.ts';

const port = Number(process.argv[2] ?? 8788);
const origin = process.argv[3] ?? 'http://localhost:4173';

const api = await startLocalApi({ origin });
const upstream = new URL(api.url);

/**
 * Nur in diesem lokalen Server, nicht im Worker: lässt den Server ein Haus samt Geräten vergessen, so als
 * wäre die Datenbank zurückgesetzt worden. POST /__test/forget-house?code=<Kopplungscode>
 */
async function forgetHouse(code: string): Promise<boolean> {
  const db = await api.db();
  const house = await db.prepare('SELECT id FROM houses WHERE code = ?').bind(code).first<{ id: string }>();
  if (!house) return false;
  for (const table of ['push_subscriptions', 'applied_actions', 'devices']) {
    await db.prepare(`DELETE FROM ${table} WHERE house_id = ?`).bind(house.id).run();
  }
  await db.prepare('DELETE FROM houses WHERE id = ?').bind(house.id).run();
  return true;
}

/**
 * Nur in diesem lokalen Server, nicht im Worker: besetzt jeden freien Platz des Hauses, so als wäre es
 * vollständig eingerichtet. POST /__test/fill-house?code=<Kopplungscode>
 */
async function fillHouse(code: string): Promise<boolean> {
  const db = await api.db();
  const row = await db.prepare('SELECT id, state FROM houses WHERE code = ?').bind(code).first<{ id: string; state: string }>();
  if (!row) return false;
  const state = JSON.parse(row.state) as HouseState;
  const content = JSON.parse(readFileSync('generated/content-rules.json', 'utf8')) as RulesContent;
  const spots = content.chapters.find((chapter) => chapter.number === state.chapter)?.rooms.flatMap((room) => room.spots) ?? [];
  const taken = new Set(state.placements.map((p) => p.spotId));
  for (const spot of spots) {
    if (!taken.has(spot.id)) state.placements.push({ pieceId: `filler-${spot.id}`, spotId: spot.id });
  }
  await db.prepare('UPDATE houses SET state = ?, rev = ? WHERE id = ?').bind(JSON.stringify(state), crypto.randomUUID(), row.id).run();
  return true;
}

const TEST_ROUTES: Record<string, (code: string) => Promise<boolean>> = {
  '/__test/forget-house': forgetHouse,
  '/__test/fill-house': fillHouse,
};

createServer((req, res) => {
  const url = new URL(req.url ?? '/', `http://localhost:${port}`);
  const helper = req.method === 'POST' ? TEST_ROUTES[url.pathname] : undefined;
  if (helper) {
    helper(url.searchParams.get('code') ?? '').then(
      (found) => res.writeHead(found ? 204 : 404).end(),
      () => res.writeHead(500).end(),
    );
    return;
  }
  const forward = request(
    { host: upstream.hostname, port: upstream.port, path: req.url, method: req.method, headers: { ...req.headers, host: upstream.host } },
    (answer) => {
      res.writeHead(answer.statusCode ?? 502, answer.headers);
      answer.pipe(res);
    },
  );
  forward.on('error', () => res.writeHead(502).end());
  req.pipe(forward);
}).listen(port, () => {
  console.log(`Lokaler Worker auf http://localhost:${port} (nimmt Anfragen von ${origin} an)`);
});
