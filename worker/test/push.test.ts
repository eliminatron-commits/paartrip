// Web Push gegen den lokal gestarteten Worker: Anmeldung, verschlüsselte Zustellung an einen lokalen
// Push-Dienst, VAPID-Nachweis und Aufräumen abgemeldeter Geräte.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { ApiError, PushKeyResponse, PushPayload } from '../../shared/api.ts';
import { call, ORIGIN, pair } from './client.ts';
import { type LocalApi, startLocalApi } from './local-api.ts';
import { decryptPush, type FakePushService, newDeviceKeys, startFakePushService, verifyVapid } from './receive.ts';

let api: LocalApi;
let service: FakePushService;

beforeAll(async () => {
  [api, service] = await Promise.all([startLocalApi({ origin: ORIGIN }), startFakePushService()]);
});
afterAll(async () => {
  await Promise.all([api.close(), service.close()]);
});

describe('Push-Anmeldung', () => {
  it('der Server gibt seinen öffentlichen Schlüssel nur an gekoppelte Geräte', async () => {
    const { a } = await pair(api);
    const reply = await call<PushKeyResponse>(api, 'GET', '/push/key', { token: a.token });
    expect(reply.json.publicKey).toBe(api.vapid.publicKey);
    expect(reply.text).not.toContain(api.vapid.privateKey);
    expect((await call(api, 'GET', '/push/key')).status).toBe(401);
  });

  it('ohne Anmeldung gibt es keine Probe-Mitteilung', async () => {
    const { a } = await pair(api);
    const reply = await call<ApiError>(api, 'POST', '/push/test', { token: a.token });
    expect(reply.status).toBe(409);
    expect(reply.json.error).toBe('no_subscription');
  });

  it('eine Anmeldung bei einem unbekannten Push-Dienst wird abgelehnt', async () => {
    const { a } = await pair(api);
    const { keys } = newDeviceKeys();
    for (const endpoint of ['https://evil.example/push/1', 'http://127.0.0.1.evil.example/push/1', 'not a url']) {
      const reply = await call(api, 'PUT', '/push/subscription', { token: a.token, body: { endpoint, keys } });
      expect(reply.status, endpoint).toBe(400);
    }
    expect((await call(api, 'POST', '/push/test', { token: a.token })).status).toBe(409);
  });
});

describe('Zustellung', () => {
  it('die Probe-Mitteilung kommt verschlüsselt an und lässt sich nur mit den Schlüsseln des Geräts lesen', async () => {
    const { a } = await pair(api);
    const device = newDeviceKeys();
    const endpoint = service.endpoint(crypto.randomUUID());
    const before = service.received.length;

    expect((await call(api, 'PUT', '/push/subscription', { token: a.token, body: { endpoint, keys: device.keys } })).status).toBe(200);
    expect((await call(api, 'POST', '/push/test', { token: a.token })).status).toBe(200);
    const push = (await service.waitFor(before + 1))[before];
    if (!push) throw new Error('keine Nachricht');

    expect(endpoint.endsWith(push.path)).toBe(true);
    expect(push.headers['content-encoding']).toBe('aes128gcm');
    expect(Number(push.headers.ttl)).toBeGreaterThan(0);

    // Absender-Nachweis: mit dem privaten Schlüssel des Servers signiert, für genau diesen Push-Dienst, kurzlebig.
    const claims = verifyVapid(String(push.headers.authorization), api.vapid.publicKey);
    expect(claims.aud).toBe(service.origin);
    expect(claims.sub).toMatch(/^https:\/\//);
    const now = Date.now() / 1000;
    expect(claims.exp).toBeGreaterThan(now);
    expect(claims.exp).toBeLessThanOrEqual(now + 24 * 60 * 60);

    // Nur das Gerät kann die Nachricht lesen; unterwegs steht der Text nirgends.
    const payload = JSON.parse(decryptPush(push.body, device).toString()) as PushPayload;
    expect(payload.kind).toBe('test');
    expect(payload.title.length).toBeGreaterThan(0);
    expect(payload.body.length).toBeGreaterThan(0);
    expect(push.body.toString('latin1')).not.toContain(payload.body);
    expect(() => decryptPush(push.body, newDeviceKeys())).toThrow();
  });

  it('jede Nachricht ist anders verschlüsselt', async () => {
    const { a } = await pair(api);
    const device = newDeviceKeys();
    const before = service.received.length;
    await call(api, 'PUT', '/push/subscription', { token: a.token, body: { endpoint: service.endpoint(crypto.randomUUID()), keys: device.keys } });
    await call(api, 'POST', '/push/test', { token: a.token });
    await service.waitFor(before + 1);
    await call(api, 'POST', '/push/test', { token: a.token });
    const [first, second] = (await service.waitFor(before + 2)).slice(before);
    if (!first || !second) throw new Error('Nachrichten fehlen');
    expect(first.body.equals(second.body)).toBe(false);
    expect(decryptPush(first.body, device).equals(decryptPush(second.body, device))).toBe(true);
  });

  it('meldet der Push-Dienst das Gerät ab, löscht der Server die Anmeldung', async () => {
    const { a } = await pair(api);
    const before = service.received.length;
    await call(api, 'PUT', '/push/subscription', { token: a.token, body: { endpoint: service.endpoint(crypto.randomUUID()), keys: newDeviceKeys().keys } });

    service.respondWith(410);
    try {
      expect((await call(api, 'POST', '/push/test', { token: a.token })).status).toBe(200);
      await service.waitFor(before + 1);
      // Das Löschen läuft nach der Antwort; kurz warten, bis es durch ist.
      await expect.poll(async () => (await call(api, 'POST', '/push/test', { token: a.token })).status).toBe(409);
    } finally {
      service.respondWith(201);
    }
  });

  it('abmelden löscht die Anmeldung', async () => {
    const { a } = await pair(api);
    await call(api, 'PUT', '/push/subscription', { token: a.token, body: { endpoint: service.endpoint(crypto.randomUUID()), keys: newDeviceKeys().keys } });
    expect((await call(api, 'DELETE', '/push/subscription', { token: a.token })).status).toBe(200);
    expect((await call(api, 'POST', '/push/test', { token: a.token })).status).toBe(409);
  });
});
