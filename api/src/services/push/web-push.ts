/**
 * Shared Web Push delivery — RFC 8030 + RFC 8291 (ECDH payload
 * encryption) + RFC 8292 (VAPID), Cloudflare-Workers compatible
 * (Web Crypto only, no Node `crypto` shim).
 *
 * Single source of truth for every server-side push fanout — extracted
 * from `routes/services.ts` (#1526 DRY + #1656 game-event push). Call
 * sites:
 *
 *   - service-inquiry / accept-inquiry (services.ts)
 *   - gamification badge-unlock     (gamification/index.ts → onBadgeUnlock)
 *   - game peer-joined / room events (routes/games.ts via the signaling DO)
 *
 * Read VAPID keys from `process.env` first, then a global `__ENV`
 * fallback so Cloudflare Worker env-binding still resolves at runtime.
 * Returns `false` when VAPID isn't configured (every caller short-
 * circuits without touching the DB) — matches the pre-extraction
 * behaviour where the helper just no-ops in dev.
 */

import { eq } from "drizzle-orm";
import { getDb, schema } from "../../db/index.js";

const { pushSubscriptions } = schema;

export interface WebPushPayload {
  title: string;
  body: string;
  url?: string;
}

interface VapidKeys {
  publicKey: string;
  privateKey: string;
  subject: string;
}

function readVapid(): VapidKeys | null {
  const publicKey = process.env.VAPID_PUBLIC_KEY
    ?? (globalThis as any).__ENV?.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY
    ?? (globalThis as any).__ENV?.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT
    ?? (globalThis as any).__ENV?.VAPID_SUBJECT
    ?? "mailto:noreply@hired.video";
  if (!publicKey || !privateKey) return null;
  return { publicKey, privateKey, subject };
}

/** Best-effort fanout to every push subscription a user has on file.
 *  Stale endpoints (410 Gone) are dropped silently. Returns `false`
 *  when VAPID isn't configured, `true` once the loop has run (even if
 *  the user has no subscriptions). */
export async function sendPushToUser(
  userId: string,
  payload: WebPushPayload,
): Promise<boolean> {
  const vapid = readVapid();
  if (!vapid) return false;
  const db = getDb();
  const subs = await db
    .select()
    .from(pushSubscriptions)
    .where(eq(pushSubscriptions.userId, userId));
  for (const sub of subs) {
    try {
      await deliverWebPush(
        { endpoint: sub.endpoint, p256dh: sub.p256dh, auth: sub.auth },
        payload,
        vapid,
      );
    } catch {
      await db
        .delete(pushSubscriptions)
        .where(eq(pushSubscriptions.endpoint, sub.endpoint))
        .catch(() => undefined);
    }
  }
  return true;
}

async function deliverWebPush(
  subscription: { endpoint: string; p256dh: string; auth: string },
  payload: WebPushPayload,
  vapid: VapidKeys,
): Promise<void> {
  const cryptoApi = (globalThis as any).crypto as Crypto;
  const salt = cryptoApi.getRandomValues(new Uint8Array(16));

  const receiverPubKey = await cryptoApi.subtle.importKey(
    "raw",
    base64UrlDecode(subscription.p256dh),
    { name: "ECDH", namedCurve: "P-256" },
    false,
    [],
  );

  const senderKeys = await cryptoApi.subtle.generateKey(
    { name: "ECDH", namedCurve: "P-256" },
    true,
    ["deriveKey"],
  ) as CryptoKeyPair;

  const sharedSecret = await cryptoApi.subtle.deriveKey(
    { name: "ECDH", public: receiverPubKey } as any,
    senderKeys.privateKey,
    { name: "HKDF", hash: "SHA-256", salt: new Uint8Array(0), info: new Uint8Array(0) } as any,
    false,
    ["deriveBits"],
  );
  const ikm = new Uint8Array(
    await cryptoApi.subtle.deriveBits(
      { name: "HKDF", hash: "SHA-256", salt: base64UrlDecode(subscription.auth), info: utf8Encode("Content-Encoding: auth\0") } as any,
      sharedSecret as any,
      256,
    ),
  );

  const senderPubKeyRaw = new Uint8Array(
    await (cryptoApi.subtle.exportKey as any)("raw", senderKeys.publicKey),
  );

  const prkKey = await cryptoApi.subtle.importKey("raw", ikm, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);

  const receiverPubKeyRaw = new Uint8Array(base64UrlDecode(subscription.p256dh));
  const cekInfo = buildInfo("aesgcm", receiverPubKeyRaw, senderPubKeyRaw);
  const nonceInfo = buildInfo("nonce", receiverPubKeyRaw, senderPubKeyRaw);

  const cekBits = new Uint8Array(await cryptoApi.subtle.sign("HMAC", prkKey, concat(hkdfExpand(salt, cekInfo))));
  const nonceBits = new Uint8Array(await cryptoApi.subtle.sign("HMAC", prkKey, concat(hkdfExpand(salt, nonceInfo))));
  const cek = cekBits.slice(0, 16);
  const nonce = nonceBits.slice(0, 12);

  const plaintext = utf8Encode(JSON.stringify(payload));
  const padded = new Uint8Array(plaintext.length + 2);
  padded.set(plaintext, 2);
  const cekKey = await cryptoApi.subtle.importKey("raw", cek, { name: "AES-GCM" }, false, ["encrypt"]);
  const ciphertext = new Uint8Array(
    await cryptoApi.subtle.encrypt({ name: "AES-GCM", iv: nonce }, cekKey, padded),
  );

  const audience = new URL(subscription.endpoint).origin;
  const now = Math.floor(Date.now() / 1000);
  const header = base64UrlEncode(utf8Encode(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const claims = base64UrlEncode(utf8Encode(JSON.stringify({ aud: audience, exp: now + 3600, sub: vapid.subject })));
  const jwtUnsigned = `${header}.${claims}`;
  const vapidPrivKey = await cryptoApi.subtle.importKey(
    "pkcs8",
    base64UrlDecode(vapid.privateKey),
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"],
  );
  const jwtSig = base64UrlEncode(
    new Uint8Array(await cryptoApi.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, vapidPrivKey, utf8Encode(jwtUnsigned))),
  );
  const jwt = `${jwtUnsigned}.${jwtSig}`;

  const encryptionHeader = `salt=${base64UrlEncode(salt)}; rs=4096; keyid=p256dh; dh=${base64UrlEncode(senderPubKeyRaw)}`;
  await fetch(subscription.endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/octet-stream",
      "Content-Encoding": "aesgcm",
      Encryption: encryptionHeader,
      "Crypto-Key": `dh=${base64UrlEncode(senderPubKeyRaw)};vapid="public-key=${vapid.publicKey}"`,
      Authorization: `vapid t=${jwt},k=${vapid.publicKey}`,
      TTL: "86400",
    },
    body: ciphertext,
  });
}

function buildInfo(type: string, clientKey: Uint8Array, serverKey: Uint8Array): Uint8Array {
  const enc = new TextEncoder();
  const prefix = enc.encode("Content-Encoding: " + type + "\0P-256\0");
  const buf = new Uint8Array(prefix.length + 2 + clientKey.length + 2 + serverKey.length);
  buf.set(prefix);
  buf[prefix.length] = (clientKey.length >> 8) & 0xff;
  buf[prefix.length + 1] = clientKey.length & 0xff;
  buf.set(clientKey, prefix.length + 2);
  buf[prefix.length + 2 + clientKey.length] = (serverKey.length >> 8) & 0xff;
  buf[prefix.length + 2 + clientKey.length + 1] = serverKey.length & 0xff;
  buf.set(serverKey, prefix.length + 2 + clientKey.length + 2);
  return buf;
}

function utf8Encode(s: string): Uint8Array {
  return new TextEncoder().encode(s);
}

function base64UrlDecode(s: string): ArrayBuffer {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/").padEnd(s.length + (4 - s.length % 4) % 4, "=");
  const bin = atob(b64);
  return Uint8Array.from(bin, (c) => c.charCodeAt(0)).buffer;
}

function base64UrlEncode(buf: Uint8Array): string {
  let bin = "";
  for (const b of buf) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

function hkdfExpand(salt: Uint8Array, info: Uint8Array): Uint8Array {
  const merged = new Uint8Array(salt.length + info.length + 1);
  merged.set(salt);
  merged.set(info, salt.length);
  merged[merged.length - 1] = 1;
  return merged;
}

function concat(...arrays: Uint8Array[]): Uint8Array {
  const len = arrays.reduce((s, a) => s + a.length, 0);
  const out = new Uint8Array(len);
  let i = 0;
  for (const a of arrays) { out.set(a, i); i += a.length; }
  return out;
}
