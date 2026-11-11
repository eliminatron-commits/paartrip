// Die Empfängerseite von Web Push für Tests: ein Gerät mit eigenen Schlüsseln und ein lokaler Push-Dienst.
// Bewusst mit node:crypto geschrieben – unabhängig von der WebCrypto-Umsetzung im Worker.
import { createDecipheriv, createECDH, createPublicKey, type ECDH, hkdfSync, randomBytes, verify } from 'node:crypto';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';

export interface DeviceKeys {
  ecdh: ECDH;
  auth: Buffer;
  /** So, wie der Browser sie in PushSubscription.toJSON() liefert. */
  keys: { p256dh: string; auth: string };
}

export function newDeviceKeys(): DeviceKeys {
  const ecdh = createECDH('prime256v1');
  ecdh.generateKeys();
  const auth = randomBytes(16);
  return { ecdh, auth, keys: { p256dh: ecdh.getPublicKey().toString('base64url'), auth: auth.toString('base64url') } };
}

/** Entschlüsselt eine aes128gcm-Nachricht (RFC 8291) mit den Schlüsseln des Geräts. */
export function decryptPush(body: Buffer, device: DeviceKeys): Buffer {
  const salt = body.subarray(0, 16);
  const keyLength = body.readUInt8(20);
  const senderPublic = body.subarray(21, 21 + keyLength);
  const ciphertext = body.subarray(21 + keyLength);

  const shared = device.ecdh.computeSecret(senderPublic);
  const info = Buffer.concat([Buffer.from('WebPush: info\0'), device.ecdh.getPublicKey(), senderPublic]);
  const ikm = Buffer.from(hkdfSync('sha256', shared, device.auth, info, 32));
  const key = Buffer.from(hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: aes128gcm\0'), 16));
  const nonce = Buffer.from(hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: nonce\0'), 12));

  const decipher = createDecipheriv('aes-128-gcm', key, nonce);
  decipher.setAuthTag(ciphertext.subarray(ciphertext.length - 16));
  const padded = Buffer.concat([decipher.update(ciphertext.subarray(0, ciphertext.length - 16)), decipher.final()]);

  // Klartext, dann 0x02 als Trennzeichen des letzten Datensatzes, dann beliebig viele Nullen.
  let end = padded.length - 1;
  while (end >= 0 && padded[end] === 0) end--;
  if (padded[end] !== 2) throw new Error('Trennzeichen des letzten Datensatzes fehlt');
  return padded.subarray(0, end);
}

export interface VapidClaims {
  aud: string;
  exp: number;
  sub: string;
}

/** Prüft den VAPID-Nachweis aus dem Authorization-Kopf gegen den öffentlichen Schlüssel und liefert seine Angaben. */
export function verifyVapid(authorization: string, publicKey: string): VapidClaims {
  const match = /^vapid t=([\w-]+)\.([\w-]+)\.([\w-]+), k=([\w-]+)$/.exec(authorization);
  if (!match) throw new Error(`unerwarteter Authorization-Kopf: ${authorization}`);
  const [, header, claims, signature, key] = match as unknown as [string, string, string, string, string];
  if (key !== publicKey) throw new Error('Schlüssel im Kopf weicht vom öffentlichen VAPID-Schlüssel ab');
  const point = Buffer.from(publicKey, 'base64url');
  const keyObject = createPublicKey({
    format: 'jwk',
    key: { kty: 'EC', crv: 'P-256', x: point.subarray(1, 33).toString('base64url'), y: point.subarray(33).toString('base64url') },
  });
  const valid = verify('sha256', Buffer.from(`${header}.${claims}`), { key: keyObject, dsaEncoding: 'ieee-p1363' }, Buffer.from(signature, 'base64url'));
  if (!valid) throw new Error('Signatur des VAPID-Nachweises stimmt nicht');
  if ((JSON.parse(Buffer.from(header, 'base64url').toString()) as { alg: string }).alg !== 'ES256') throw new Error('falsches Verfahren');
  return JSON.parse(Buffer.from(claims, 'base64url').toString()) as VapidClaims;
}

export interface ReceivedPush {
  path: string;
  headers: Record<string, string | string[] | undefined>;
  body: Buffer;
}

export interface FakePushService {
  /** Adresse, unter der sich ein Gerät "anmeldet". */
  endpoint(id: string): string;
  origin: string;
  received: ReceivedPush[];
  /** Antwortstatus für alle folgenden Nachrichten (201 = angenommen, 410 = Gerät abgemeldet). */
  respondWith(status: number): void;
  /** Wartet, bis insgesamt `count` Nachrichten angekommen sind. */
  waitFor(count: number): Promise<ReceivedPush[]>;
  close(): Promise<void>;
}

/** Lokaler Server in der Rolle des Push-Dienstes (bei iPhones wäre das Apple). */
export function startFakePushService(): Promise<FakePushService> {
  const received: ReceivedPush[] = [];
  let status = 201;
  const server = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => {
      received.push({ path: req.url ?? '', headers: req.headers, body: Buffer.concat(chunks) });
      res.writeHead(status).end();
    });
  });
  return new Promise((ready) => {
    server.listen(0, '127.0.0.1', () => {
      const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
      ready({
        origin,
        endpoint: (id) => `${origin}/push/${id}`,
        received,
        respondWith(next) {
          status = next;
        },
        async waitFor(count) {
          const deadline = Date.now() + 5000;
          while (received.length < count) {
            if (Date.now() > deadline) throw new Error(`nur ${received.length} von ${count} Push-Nachrichten angekommen`);
            await new Promise((tick) => setTimeout(tick, 20));
          }
          return received;
        },
        close: () => new Promise((closed) => server.close(() => closed())),
      });
    });
  });
}
