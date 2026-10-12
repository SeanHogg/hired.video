/**
 * Round-trip tests for the RFC 8291 / RFC 8292 wire format in
 * `web-push-crypto.ts`. Acts as the browser: generates a receiver key
 * pair + auth secret, decrypts what the server produced, and verifies the
 * VAPID JWT signature against the public key.
 *
 * Run: node --import tsx --test src/services/push/__tests__/web-push-crypto.test.ts
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  base64UrlDecode,
  base64UrlEncode,
  buildVapidAuthorization,
  deriveContentKeys,
  encryptPushPayload,
} from "../web-push-crypto.js";

const subtle = crypto.subtle;

async function makeReceiver() {
  const pair = (await subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, [
    "deriveBits",
  ])) as CryptoKeyPair;
  const publicKey = new Uint8Array((await subtle.exportKey("raw", pair.publicKey)) as ArrayBuffer);
  const authSecret = crypto.getRandomValues(new Uint8Array(16));
  return { pair, publicKey, authSecret };
}

async function decrypt(body: Uint8Array, receiver: Awaited<ReturnType<typeof makeReceiver>>) {
  const salt = body.slice(0, 16);
  const recordSize = new DataView(body.buffer, body.byteOffset).getUint32(16);
  const idLen = body[20];
  const senderPublicKey = body.slice(21, 21 + idLen);
  const ciphertext = body.slice(21 + idLen);
  const senderKey = await subtle.importKey("raw", senderPublicKey, { name: "ECDH", namedCurve: "P-256" }, false, []);
  const ecdhSecret = new Uint8Array(
    await subtle.deriveBits({ name: "ECDH", public: senderKey } as unknown as SubtleCryptoDeriveKeyAlgorithm, receiver.pair.privateKey, 256),
  );
  const { cek, nonce } = await deriveContentKeys({
    ecdhSecret,
    authSecret: receiver.authSecret,
    receiverPublicKey: receiver.publicKey,
    senderPublicKey,
    salt,
  });
  const key = await subtle.importKey("raw", cek, "AES-GCM", false, ["decrypt"]);
  const record = new Uint8Array(await subtle.decrypt({ name: "AES-GCM", iv: nonce }, key, ciphertext));
  return { recordSize, idLen, record };
}

describe("encryptPushPayload (RFC 8291 aes128gcm)", () => {
  it("round-trips: the receiver decrypts the exact payload plus the last-record delimiter", async () => {
    const receiver = await makeReceiver();
    const payload = JSON.stringify({ title: "New badge", body: "You earned Résumé Pro 🎉", url: "/points" });
    const body = await encryptPushPayload(new TextEncoder().encode(payload), {
      p256dh: base64UrlEncode(receiver.publicKey),
      auth: base64UrlEncode(receiver.authSecret),
    });
    const { recordSize, idLen, record } = await decrypt(body, receiver);
    assert.equal(recordSize, 4096);
    assert.equal(idLen, 65);
    assert.equal(record[record.length - 1], 2);
    assert.equal(new TextDecoder().decode(record.slice(0, -1)), payload);
  });

  it("uses a fresh salt and sender key per message", async () => {
    const receiver = await makeReceiver();
    const keys = { p256dh: base64UrlEncode(receiver.publicKey), auth: base64UrlEncode(receiver.authSecret) };
    const a = await encryptPushPayload(new TextEncoder().encode("x"), keys);
    const b = await encryptPushPayload(new TextEncoder().encode("x"), keys);
    assert.notDeepEqual(a.slice(0, 86), b.slice(0, 86));
  });

  it("rejects a malformed receiver key", async () => {
    await assert.rejects(encryptPushPayload(new Uint8Array([1]), { p256dh: "AAAA", auth: "AAAA" }));
  });
});

describe("buildVapidAuthorization (RFC 8292)", () => {
  async function makeVapid() {
    const pair = (await subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, [
      "sign",
      "verify",
    ])) as CryptoKeyPair;
    const jwk = (await subtle.exportKey("jwk", pair.privateKey)) as JsonWebKey;
    const publicKey = base64UrlEncode(new Uint8Array((await subtle.exportKey("raw", pair.publicKey)) as ArrayBuffer));
    const pkcs8 = base64UrlEncode(new Uint8Array((await subtle.exportKey("pkcs8", pair.privateKey)) as ArrayBuffer));
    return { pair, publicKey, rawPrivate: jwk.d as string, pkcs8 };
  }

  async function assertValid(header: string, publicKey: string, verifyKey: CryptoKey) {
    const match = /^vapid t=([^,]+), k=(.+)$/.exec(header);
    assert.ok(match, header);
    const [, jwt, k] = match;
    assert.equal(k, publicKey);
    const [h, c, s] = jwt.split(".");
    const claims = JSON.parse(new TextDecoder().decode(base64UrlDecode(c)));
    assert.equal(claims.aud, "https://fcm.googleapis.com");
    assert.equal(claims.sub, "mailto:ops@hired.video");
    assert.equal(claims.exp, 1_000 + 12 * 60 * 60);
    const ok = await subtle.verify(
      { name: "ECDSA", hash: "SHA-256" },
      verifyKey,
      base64UrlDecode(s),
      new TextEncoder().encode(`${h}.${c}`),
    );
    assert.equal(ok, true);
  }

  it("signs with a raw 32-byte private key (web-push CLI format)", async () => {
    const v = await makeVapid();
    const header = await buildVapidAuthorization(
      "https://fcm.googleapis.com/fcm/send/abc",
      { publicKey: v.publicKey, privateKey: v.rawPrivate, subject: "mailto:ops@hired.video" },
      1_000,
    );
    await assertValid(header, v.publicKey, v.pair.publicKey);
  });

  it("signs with a PKCS#8 private key", async () => {
    const v = await makeVapid();
    const header = await buildVapidAuthorization(
      "https://fcm.googleapis.com/fcm/send/abc",
      { publicKey: v.publicKey, privateKey: v.pkcs8, subject: "mailto:ops@hired.video" },
      1_000,
    );
    await assertValid(header, v.publicKey, v.pair.publicKey);
  });
});
