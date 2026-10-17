/**
 * Web Push wire format — pure Web Crypto, Cloudflare-Workers compatible.
 *
 *   - RFC 8291 message encryption, `aes128gcm` content coding (RFC 8188)
 *   - RFC 8292 VAPID `Authorization: vapid t=<jwt>, k=<public key>`
 *
 * No I/O and no env reads: `web-push.ts` owns key loading + delivery, this
 * module only turns (payload, subscription keys, VAPID keys) into bytes and
 * headers so the round trip is unit-testable (see
 * `__tests__/web-push-crypto.test.ts`, which decrypts with the receiver key).
 */

import { base64UrlEncode, base64UrlToBytes } from "../../utils/crypto.js";

export interface PushSubscriptionKeys {
  /** Receiver public key — base64url, uncompressed P-256 point (65 bytes). */
  p256dh: string;
  /** Receiver auth secret — base64url, 16 bytes. */
  auth: string;
}

export interface VapidKeys {
  /** base64url uncompressed P-256 public key (65 bytes). */
  publicKey: string;
  /** base64url private key — raw 32-byte scalar (web-push CLI format) or PKCS#8. */
  privateKey: string;
  /** `mailto:` or `https:` contact URI. */
  subject: string;
}

/** Record size advertised in the aes128gcm header. One record per message. */
const RECORD_SIZE = 4096;
const VAPID_TTL_SECONDS = 12 * 60 * 60;

const subtle = (): SubtleCrypto => crypto.subtle;
const utf8 = (s: string): Uint8Array => new TextEncoder().encode(s);

async function hkdf(
  salt: Uint8Array,
  ikm: Uint8Array,
  info: Uint8Array,
  bytes: number,
): Promise<Uint8Array> {
  const key = await subtle().importKey("raw", ikm, "HKDF", false, ["deriveBits"]);
  const bits = await subtle().deriveBits({ name: "HKDF", hash: "SHA-256", salt, info }, key, bytes * 8);
  return new Uint8Array(bits);
}

/** Derive the content-encryption key + nonce shared by sender and receiver
 *  (RFC 8291 §3.3–3.4). Exported so the test can decrypt symmetrically. */
export async function deriveContentKeys(input: {
  ecdhSecret: Uint8Array;
  authSecret: Uint8Array;
  receiverPublicKey: Uint8Array;
  senderPublicKey: Uint8Array;
  salt: Uint8Array;
}): Promise<{ cek: Uint8Array; nonce: Uint8Array }> {
  const keyInfo = concat(
    utf8("WebPush: info\0"),
    input.receiverPublicKey,
    input.senderPublicKey,
  );
  const ikm = await hkdf(input.authSecret, input.ecdhSecret, keyInfo, 32);
  const cek = await hkdf(input.salt, ikm, utf8("Content-Encoding: aes128gcm\0"), 16);
  const nonce = await hkdf(input.salt, ikm, utf8("Content-Encoding: nonce\0"), 12);
  return { cek, nonce };
}

/** Encrypt `plaintext` for one subscription → the full aes128gcm body
 *  (header block: salt ‖ rs ‖ idlen ‖ sender key, then the ciphertext). */
export async function encryptPushPayload(
  plaintext: Uint8Array,
  keys: PushSubscriptionKeys,
): Promise<Uint8Array> {
  const receiverPublicKey = base64UrlToBytes(keys.p256dh);
  const authSecret = base64UrlToBytes(keys.auth);
  const receiverKey = await subtle().importKey(
    "raw",
    receiverPublicKey,
    { name: "ECDH", namedCurve: "P-256" },
    false,
    [],
  );
  const sender = (await subtle().generateKey(
    { name: "ECDH", namedCurve: "P-256" },
    true,
    ["deriveBits"],
  )) as CryptoKeyPair;
  const senderPublicKey = new Uint8Array(await subtle().exportKey("raw", sender.publicKey) as ArrayBuffer);
  const ecdhSecret = new Uint8Array(
    // Workers typings call the field `$public`; the runtime (and spec) use `public`.
    await subtle().deriveBits(
      { name: "ECDH", public: receiverKey } as unknown as SubtleCryptoDeriveKeyAlgorithm,
      sender.privateKey,
      256,
    ),
  );
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const { cek, nonce } = await deriveContentKeys({
    ecdhSecret,
    authSecret,
    receiverPublicKey,
    senderPublicKey,
    salt,
  });

  // Single (last) record: plaintext ‖ 0x02 delimiter, no extra padding.
  const record = concat(plaintext, new Uint8Array([2]));
  const aesKey = await subtle().importKey("raw", cek, "AES-GCM", false, ["encrypt"]);
  const ciphertext = new Uint8Array(
    await subtle().encrypt({ name: "AES-GCM", iv: nonce }, aesKey, record),
  );

  const header = new Uint8Array(16 + 4 + 1 + senderPublicKey.length);
  header.set(salt, 0);
  new DataView(header.buffer).setUint32(16, RECORD_SIZE);
  header[20] = senderPublicKey.length;
  header.set(senderPublicKey, 21);
  return concat(header, ciphertext);
}

/** Build the RFC 8292 `Authorization` header value for one push endpoint. */
export async function buildVapidAuthorization(
  endpoint: string,
  vapid: VapidKeys,
  nowSeconds: number = Math.floor(Date.now() / 1000),
): Promise<string> {
  const audience = new URL(endpoint).origin;
  const header = base64UrlEncode(utf8(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const claims = base64UrlEncode(
    utf8(JSON.stringify({ aud: audience, exp: nowSeconds + VAPID_TTL_SECONDS, sub: vapid.subject })),
  );
  const unsigned = `${header}.${claims}`;
  const signingKey = await importVapidPrivateKey(vapid);
  // Web Crypto ECDSA signatures are already JOSE-shaped (r ‖ s, 64 bytes).
  const signature = new Uint8Array(
    await subtle().sign({ name: "ECDSA", hash: "SHA-256" }, signingKey, utf8(unsigned)),
  );
  return `vapid t=${unsigned}.${base64UrlEncode(signature)}, k=${vapid.publicKey}`;
}

async function importVapidPrivateKey(vapid: VapidKeys): Promise<CryptoKey> {
  const raw = base64UrlToBytes(vapid.privateKey);
  if (raw.length === 32) {
    // Raw scalar (the format `web-push generate-vapid-keys` prints) → JWK,
    // taking x/y from the uncompressed public point (0x04 ‖ x ‖ y).
    const pub = base64UrlToBytes(vapid.publicKey);
    return subtle().importKey(
      "jwk",
      {
        kty: "EC",
        crv: "P-256",
        d: vapid.privateKey,
        x: base64UrlEncode(pub.slice(1, 33)),
        y: base64UrlEncode(pub.slice(33, 65)),
        ext: false,
      },
      { name: "ECDSA", namedCurve: "P-256" },
      false,
      ["sign"],
    );
  }
  return subtle().importKey("pkcs8", raw, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
}

export function concat(...arrays: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(arrays.reduce((n, a) => n + a.length, 0));
  let offset = 0;
  for (const a of arrays) {
    out.set(a, offset);
    offset += a.length;
  }
  return out;
}
