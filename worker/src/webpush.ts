// Web Push ohne Bibliothek, nur mit WebCrypto: Absender-Nachweis per VAPID (RFC 8292) und
// Verschlüsselung der Nutzlast für genau ein Gerät (RFC 8291, Inhaltskodierung aes128gcm).
// Der Push-Dienst (bei iPhones Apple) sieht nur die verschlüsselte Nachricht.

const encoder = new TextEncoder();

/** Text als Bytes in einem eigenen ArrayBuffer (so nimmt WebCrypto sie in jeder Typumgebung an). */
function utf8(text: string): Uint8Array<ArrayBuffer> {
  return new Uint8Array(encoder.encode(text));
}

export function b64urlEncode(data: ArrayBuffer | Uint8Array): string {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function b64urlDecode(text: string): Uint8Array<ArrayBuffer> {
  const binary = atob(text.replace(/-/g, '+').replace(/_/g, '/'));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function concat(...parts: Uint8Array[]): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(parts.reduce((sum, p) => sum + p.length, 0));
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

export interface VapidKeys {
  /** Öffentlicher Schlüssel: unkomprimierter P-256-Punkt (65 Byte), base64url. */
  publicKey: string;
  /** Privater Schlüssel (32 Byte), base64url. Liegt nur als Worker-Secret vor. */
  privateKey: string;
  /** Kontakt des Absenders für den Push-Dienst: eine https- oder mailto-Adresse. */
  subject: string;
}

/** Die Push-Anmeldung eines Geräts. */
export interface PushTarget {
  endpoint: string;
  p256dh: string;
  auth: string;
}

/** Wie lange der Push-Dienst eine Nachricht für ein nicht erreichbares Gerät aufbewahrt. */
const TTL_SECONDS = 24 * 60 * 60;
/** Gültigkeit des VAPID-Nachweises; Push-Dienste erlauben höchstens 24 Stunden. */
const VAPID_VALID_SECONDS = 12 * 60 * 60;

/** Wert des Authorization-Kopfs: ein mit dem privaten Schlüssel signiertes, kurzlebiges JWT. */
export async function vapidAuthorization(endpoint: string, keys: VapidKeys, nowSeconds: number): Promise<string> {
  const point = b64urlDecode(keys.publicKey);
  if (point.length !== 65 || point[0] !== 4) throw new Error('VAPID_PUBLIC_KEY ist kein unkomprimierter P-256-Punkt');
  const key = await crypto.subtle.importKey(
    'jwk',
    { kty: 'EC', crv: 'P-256', x: b64urlEncode(point.slice(1, 33)), y: b64urlEncode(point.slice(33)), d: keys.privateKey },
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign'],
  );
  const header = b64urlEncode(utf8(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const claims = b64urlEncode(
    utf8(JSON.stringify({ aud: new URL(endpoint).origin, exp: nowSeconds + VAPID_VALID_SECONDS, sub: keys.subject })),
  );
  const signature = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, utf8(`${header}.${claims}`));
  return `vapid t=${header}.${claims}.${b64urlEncode(signature)}, k=${keys.publicKey}`;
}

async function hkdf(salt: Uint8Array<ArrayBuffer>, ikm: Uint8Array<ArrayBuffer>, info: Uint8Array<ArrayBuffer>, length: number) {
  const key = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info }, key, length * 8));
}

/** Verschlüsselt die Nutzlast so, dass nur das angemeldete Gerät sie lesen kann. */
export async function encryptPayload(target: Pick<PushTarget, 'p256dh' | 'auth'>, plaintext: Uint8Array): Promise<Uint8Array<ArrayBuffer>> {
  const devicePublic = b64urlDecode(target.p256dh);
  const authSecret = b64urlDecode(target.auth);

  // Einmal-Schlüsselpaar je Nachricht; aus ihm und dem Geräteschlüssel entsteht das gemeinsame Geheimnis.
  const deviceKey = await crypto.subtle.importKey('raw', devicePublic, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const local = (await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits'])) as CryptoKeyPair;
  const localPublic = new Uint8Array((await crypto.subtle.exportKey('raw', local.publicKey)) as ArrayBuffer);
  // Die Workers-Typen nennen das Feld anders als der Standard; zur Laufzeit heißt es überall `public`.
  const ecdh = { name: 'ECDH', public: deviceKey } as unknown as Parameters<typeof crypto.subtle.deriveBits>[0];
  const shared = new Uint8Array(await crypto.subtle.deriveBits(ecdh, local.privateKey, 256));

  const ikm = await hkdf(authSecret, shared, concat(utf8('WebPush: info\0'), devicePublic, localPublic), 32);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const contentKey = await hkdf(salt, ikm, utf8('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdf(salt, ikm, utf8('Content-Encoding: nonce\0'), 12);

  const aesKey = await crypto.subtle.importKey('raw', contentKey, 'AES-GCM', false, ['encrypt']);
  // 0x02 markiert den letzten (hier einzigen) Datensatz.
  const record = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, aesKey, concat(plaintext, new Uint8Array([2]))));

  // Kopf: Salt (16) | Datensatzgröße (4) | Länge des Schlüssels (1) | Einmal-Schlüssel (65)
  const head = new Uint8Array(21);
  head.set(salt, 0);
  new DataView(head.buffer).setUint32(16, 4096);
  head[20] = localPublic.length;
  return concat(head, localPublic, record);
}

export type PushResult = 'sent' | 'gone' | 'failed';

/** Schickt eine Nachricht an ein Gerät. 'gone' heißt: Die Anmeldung gibt es nicht mehr und kann gelöscht werden. */
export async function sendPush(target: PushTarget, payload: unknown, keys: VapidKeys): Promise<PushResult> {
  const body = await encryptPayload(target, utf8(JSON.stringify(payload)));
  const response = await fetch(target.endpoint, {
    method: 'POST',
    headers: {
      Authorization: await vapidAuthorization(target.endpoint, keys, Math.floor(Date.now() / 1000)),
      'Content-Encoding': 'aes128gcm',
      'Content-Type': 'application/octet-stream',
      TTL: String(TTL_SECONDS),
      Urgency: 'normal',
    },
    body,
  });
  if (response.status === 404 || response.status === 410) return 'gone';
  return response.ok ? 'sent' : 'failed';
}
