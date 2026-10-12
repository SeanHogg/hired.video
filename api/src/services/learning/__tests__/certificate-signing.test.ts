/**
 * #1500 — certificate signature verification across both algorithms.
 *
 * `CertificateService.verify()` discriminates by the signed-payload format:
 *   `${b64}.${sig}`            → HMAC-SHA256 (default / legacy, same-origin)
 *   `${b64}.${sig}.ed25519`    → Ed25519 (asymmetric, JWKS-verifiable)
 * base64url contains no ".", so every existing 2-part cert deterministically
 * takes the unchanged HMAC path — the asymmetric path is purely additive and
 * dormant until a keypair is provisioned. These tests pin both paths + the
 * tamper / wrong-key / missing-key failure modes + the published JWK.
 *
 * The crypto is exercised for real (Web Crypto Ed25519 + HMAC); the DB is the
 * shared fake-db (verify() only does a single keyed select).
 *
 * Run: node --import tsx --test src/services/learning/__tests__/certificate-signing.test.ts
 */

import { describe, it } from "node:test";
import { strict as assert } from "node:assert";

import { buildFakeDb } from "../../../handlers/__testing__/fake-db.js";
import { CertificateService } from "../certificate-service.js";

const SECRET = "test-hmac-secret-value";
const CERT_NO = "HV-2026-ABCD1234";

// ── tiny re-implementations of the service's private encoders ──────────────
const enc = (s: string) => new TextEncoder().encode(s);
function b64url(bytes: Uint8Array): string {
  let bin = "";
  for (const x of bytes) bin += String.fromCharCode(x);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function stdB64(bytes: Uint8Array): string {
  let bin = "";
  for (const x of bytes) bin += String.fromCharCode(x);
  return btoa(bin);
}
function canonical(obj: Record<string, unknown>): string {
  const keys = Object.keys(obj).sort();
  const ordered: Record<string, unknown> = {};
  for (const k of keys) ordered[k] = obj[k];
  return JSON.stringify(ordered);
}
const payloadFor = () => ({
  certNumber: CERT_NO,
  courseId: "11111111-1111-4111-8111-111111111111",
  userId: "22222222-2222-4222-8222-222222222222",
  issuedAt: "2026-06-16T00:00:00.000Z",
  recipientName: "Ada Lovelace",
  courseTitle: "Foundations of Analytical Engines",
  finalScorePct: 92,
});
const payloadB64 = () => b64url(enc(canonical(payloadFor())));

async function hmacSig(secret: string, msg: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", enc(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return b64url(new Uint8Array(await crypto.subtle.sign("HMAC", key, enc(msg))));
}

async function genEd25519() {
  const kp = (await crypto.subtle.generateKey({ name: "Ed25519" }, true, ["sign", "verify"])) as CryptoKeyPair;
  // exportKey is typed `ArrayBuffer | JsonWebKey` in this project's lib; the
  // pkcs8/raw formats always yield an ArrayBuffer at runtime.
  const pkcs8 = new Uint8Array((await crypto.subtle.exportKey("pkcs8", kp.privateKey)) as ArrayBuffer);
  const raw = new Uint8Array((await crypto.subtle.exportKey("raw", kp.publicKey)) as ArrayBuffer);
  return { kp, privB64: stdB64(pkcs8), pubB64: stdB64(raw) };
}
async function ed25519Sig(priv: CryptoKey, msg: string): Promise<string> {
  return b64url(new Uint8Array(await crypto.subtle.sign({ name: "Ed25519" }, priv, enc(msg))));
}

// Deterministically corrupt a base64url signature. Must flip a FULLY significant
// byte: a 64-byte Ed25519 sig is 86 base64url chars whose final char carries only
// 2 significant bits (4 "don't care" padding bits), so mutating the tail can decode
// to the SAME bytes — the (correct) verifier then accepts it. That was a ~1/256 CI
// flake. byte 0 is always fully significant, so flipping sig[0] is a real tamper.
const tamperSig = (sig: string) => (sig[0] === "A" ? "B" : "A") + sig.slice(1);

function seedCert(signedPayload: string) {
  return buildFakeDb({
    course_certificates: [
      { id: "cert-1", certNumber: CERT_NO, signedPayload, revokedAt: null, expiresAt: null },
    ],
  });
}

// ── HMAC (legacy / default) path ───────────────────────────────────────────

describe("CertificateService.verify — HMAC (2-part) back-compat", () => {
  it("validates a correctly HMAC-signed cert", async () => {
    const b64 = payloadB64();
    const sig = await hmacSig(SECRET, b64);
    const { db } = seedCert(`${b64}.${sig}`);
    const out = await new CertificateService(db as never, SECRET).verify(CERT_NO);
    assert.equal(out.valid, true);
    if (out.valid) assert.equal(out.payload.recipientName, "Ada Lovelace");
  });

  it("rejects a tampered HMAC signature", async () => {
    const b64 = payloadB64();
    const sig = await hmacSig(SECRET, b64);
    const bad = tamperSig(sig);
    const { db } = seedCert(`${b64}.${bad}`);
    const out = await new CertificateService(db as never, SECRET).verify(CERT_NO);
    assert.equal(out.valid, false);
    if (!out.valid) assert.equal(out.reason, "tampered");
  });

  it("rejects when the wrong HMAC secret is used", async () => {
    const b64 = payloadB64();
    const sig = await hmacSig("a-different-secret", b64);
    const { db } = seedCert(`${b64}.${sig}`);
    const out = await new CertificateService(db as never, SECRET).verify(CERT_NO);
    assert.equal(out.valid, false);
  });
});

// ── Ed25519 (asymmetric) path ──────────────────────────────────────────────

describe("CertificateService.verify — Ed25519 (3-part)", () => {
  it("validates a correctly Ed25519-signed cert with the matching public key", async () => {
    const { kp, pubB64 } = await genEd25519();
    const b64 = payloadB64();
    const sig = await ed25519Sig(kp.privateKey, b64);
    const { db } = seedCert(`${b64}.${sig}.ed25519`);
    const svc = new CertificateService(db as never, SECRET, { ed25519: { publicKeyRawB64: pubB64 } });
    const out = await svc.verify(CERT_NO);
    assert.equal(out.valid, true);
    if (out.valid) assert.equal(out.payload.courseTitle, "Foundations of Analytical Engines");
  });

  it("rejects a tampered Ed25519 signature", async () => {
    const { kp, pubB64 } = await genEd25519();
    const b64 = payloadB64();
    const sig = await ed25519Sig(kp.privateKey, b64);
    const bad = tamperSig(sig);
    const { db } = seedCert(`${b64}.${bad}.ed25519`);
    const svc = new CertificateService(db as never, SECRET, { ed25519: { publicKeyRawB64: pubB64 } });
    const out = await svc.verify(CERT_NO);
    assert.equal(out.valid, false);
    if (!out.valid) assert.equal(out.reason, "tampered");
  });

  it("rejects a cert signed by a DIFFERENT key (wrong public key)", async () => {
    const signer = await genEd25519();
    const other = await genEd25519();
    const b64 = payloadB64();
    const sig = await ed25519Sig(signer.kp.privateKey, b64);
    const { db } = seedCert(`${b64}.${sig}.ed25519`);
    // Service holds the OTHER key — must not validate the signer's cert.
    const svc = new CertificateService(db as never, SECRET, { ed25519: { publicKeyRawB64: other.pubB64 } });
    const out = await svc.verify(CERT_NO);
    assert.equal(out.valid, false);
  });

  it("rejects an Ed25519 cert when no public key is configured", async () => {
    const { kp } = await genEd25519();
    const b64 = payloadB64();
    const sig = await ed25519Sig(kp.privateKey, b64);
    const { db } = seedCert(`${b64}.${sig}.ed25519`);
    const out = await new CertificateService(db as never, SECRET).verify(CERT_NO); // HMAC-only svc
    assert.equal(out.valid, false);
    if (!out.valid) assert.equal(out.reason, "tampered");
  });
});

// ── publicJwk (JWKS endpoint source) ───────────────────────────────────────

describe("CertificateService.publicJwk", () => {
  it("returns a signing JWK when an Ed25519 public key is configured", async () => {
    const { pubB64 } = await genEd25519();
    const { db } = buildFakeDb({});
    const svc = new CertificateService(db as never, SECRET, { ed25519: { publicKeyRawB64: pubB64 } });
    const jwk = await svc.publicJwk();
    assert.ok(jwk);
    assert.equal(jwk!.kty, "OKP");
    assert.equal(jwk!.crv, "Ed25519");
    assert.equal(jwk!.alg, "EdDSA");
    assert.equal(jwk!.use, "sig");
    assert.ok(typeof jwk!.x === "string" && (jwk!.x as string).length > 0);
  });

  it("returns null when no Ed25519 public key is configured (HMAC-only deploy)", async () => {
    const { db } = buildFakeDb({});
    const jwk = await new CertificateService(db as never, SECRET).publicJwk();
    assert.equal(jwk, null);
  });
});
