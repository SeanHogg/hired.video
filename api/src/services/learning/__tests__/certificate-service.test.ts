/**
 * #1961 — Certificate HMAC security-path tests.
 *
 * CertificateService signs a course-completion payload with HMAC-SHA256
 * (WebCrypto `crypto.subtle`) over a canonical JSON blob, storing it as
 * `${base64url(canonicalJson)}.${hmac}`. The public `verify()` re-derives
 * the HMAC from the stored b64 half and constant-time-compares it to the
 * stored signature.
 *
 * We exercise the REAL signer + REAL verifier together (the private `sign`
 * is reached via a runtime cast — `private` is erased by tsx, so this hits
 * the actual WebCrypto path, not a re-implementation). The cert row is held
 * in the repo's buildFakeDb shim, which evaluates the `where(eq(certNumber))`
 * predicate for real, so verify() reads the same row a production read would.
 *
 * Asserted security invariants:
 *   • a freshly-signed payload verifies true (round-trip)
 *   • a tampered payload (flipped byte in either half) verifies false
 *   • a signature produced with a DIFFERENT secret fails (wrong key)
 *   • revoked / expired / unknown certs short-circuit before the HMAC check
 *
 * Run: node --import tsx --test src/services/learning/__tests__/certificate-service.test.ts
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { CertificateService } from "../certificate-service.js";
import { buildFakeDb } from "../../../handlers/__testing__/fake-db.js";
import { schema } from "../../../db/index.js";

const { courseCertificates } = schema;

// Seed-derived-shaped UUIDs (per feedback_tests_with_real_fixtures: ids the
// code actually reads — userId / courseId / enrollmentId are stored inside
// the signed payload and on the row).
const SECRET = "test-jwt-signing-secret-32-bytes-long!";
const WRONG_SECRET = "a-totally-different-signing-secret-value";

const basePayload = {
  certNumber: "HV-2026-ABCD1234",
  courseId: "11111111-1111-4111-8111-111111111111",
  userId: "22222222-2222-4222-8222-222222222222",
  issuedAt: "2026-06-07T00:00:00.000Z",
  recipientName: "Ada Lovelace",
  courseTitle: "AI Fundamentals for Job Seekers",
  finalScorePct: 92,
};

/** Build a service over a fake-db plus a real signer, returning helpers to
 *  sign-and-store a cert row, mirroring what _issueFor would have written. */
function setup(secret = SECRET) {
  const { db, state } = buildFakeDb({ course_certificates: [] });
  const svc = new CertificateService(db as never, secret);

  async function storeCert(
    payload = basePayload,
    over: Partial<{ certNumber: string; signedPayload: string; revokedAt: Date | null; expiresAt: Date | null }> = {},
  ) {
    // Real signer — exercises crypto.subtle HMAC + canonicalJson + base64url.
    const signed = over.signedPayload ?? (await (svc as any).sign(payload));
    const certNumber = over.certNumber ?? payload.certNumber;
    state.course_certificates.push({
      id: crypto.randomUUID(),
      enrollmentId: "33333333-3333-4333-8333-333333333333",
      courseId: payload.courseId,
      userId: payload.userId,
      certNumber,
      issuedAt: new Date(payload.issuedAt),
      expiresAt: over.expiresAt ?? null,
      signedPayload: signed,
      courseTitle: payload.courseTitle,
      recipientName: payload.recipientName,
      revokedAt: over.revokedAt ?? null,
      revokedReason: null,
      createdAt: new Date(),
    });
    return { certNumber, signed };
  }

  return { svc, state, storeCert };
}

describe("CertificateService.verify — HMAC happy path", () => {
  it("a freshly-signed payload verifies true and round-trips the payload", async () => {
    const { svc, storeCert } = setup();
    const { certNumber } = await storeCert();
    const result = await svc.verify(certNumber);
    assert.equal(result.valid, true);
    if (result.valid) {
      assert.equal(result.payload.certNumber, basePayload.certNumber);
      assert.equal(result.payload.userId, basePayload.userId);
      assert.equal(result.payload.finalScorePct, 92);
      assert.equal(result.certificate.certNumber, certNumber);
    }
  });

  it("canonicalisation is key-order independent — a re-signed equivalent payload still verifies", async () => {
    const { svc, storeCert } = setup();
    // Same fields, scrambled insertion order — canonicalJson sorts keys, so
    // the signature is stable and verify() must accept it.
    const scrambled = {
      finalScorePct: 92,
      userId: basePayload.userId,
      courseTitle: basePayload.courseTitle,
      certNumber: basePayload.certNumber,
      recipientName: basePayload.recipientName,
      issuedAt: basePayload.issuedAt,
      courseId: basePayload.courseId,
    };
    const { certNumber } = await storeCert(scrambled as typeof basePayload);
    const result = await svc.verify(certNumber);
    assert.equal(result.valid, true);
  });
});

describe("CertificateService.verify — tamper detection", () => {
  it("a flipped byte in the signature half fails as tampered", async () => {
    const { svc, state, storeCert } = setup();
    const { certNumber, signed } = await storeCert();
    const [b64, sig] = signed.split(".");
    // Flip the last character of the signature.
    const lastChar = sig[sig.length - 1];
    const flipped = (lastChar === "A" ? "B" : "A");
    const row = state.course_certificates.find((r) => r.certNumber === certNumber)!;
    row.signedPayload = `${b64}.${sig.slice(0, -1)}${flipped}`;
    const result = await svc.verify(certNumber);
    assert.equal(result.valid, false);
    if (!result.valid) assert.equal(result.reason, "tampered");
  });

  it("a mutated payload half (re-encoded different data) fails — the stored sig no longer matches", async () => {
    const { svc, state, storeCert } = setup();
    const { certNumber, signed } = await storeCert();
    const [, sig] = signed.split(".");
    // Re-encode a payload claiming a perfect score, keep the OLD signature.
    const forgedJson = JSON.stringify({ ...basePayload, finalScorePct: 100 });
    const forgedB64 = Buffer.from(forgedJson, "utf8")
      .toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
    const row = state.course_certificates.find((r) => r.certNumber === certNumber)!;
    row.signedPayload = `${forgedB64}.${sig}`;
    const result = await svc.verify(certNumber);
    assert.equal(result.valid, false);
    if (!result.valid) assert.equal(result.reason, "tampered");
  });

  it("a malformed signedPayload (no dot separator) fails as tampered", async () => {
    const { svc, state, storeCert } = setup();
    const { certNumber } = await storeCert();
    const row = state.course_certificates.find((r) => r.certNumber === certNumber)!;
    row.signedPayload = "not-a-valid-dotted-payload";
    const result = await svc.verify(certNumber);
    assert.equal(result.valid, false);
    if (!result.valid) assert.equal(result.reason, "tampered");
  });
});

describe("CertificateService.verify — wrong key", () => {
  it("a signature minted with a DIFFERENT secret does not verify under the real key", async () => {
    // Mint the signature with the wrong secret…
    const wrong = setup(WRONG_SECRET);
    const forged = await (wrong.svc as any).sign(basePayload);

    // …but store + verify it under the production-key service.
    const real = setup(SECRET);
    const { certNumber } = await real.storeCert(basePayload, { signedPayload: forged });
    const result = await real.svc.verify(certNumber);
    assert.equal(result.valid, false);
    if (!result.valid) assert.equal(result.reason, "tampered");
  });

  it("the SAME payload yields DIFFERENT signatures under different keys (HMAC is key-bound)", async () => {
    const a = setup(SECRET);
    const b = setup(WRONG_SECRET);
    const sigA = await (a.svc as any).sign(basePayload);
    const sigB = await (b.svc as any).sign(basePayload);
    // Same canonical b64 payload half, different HMAC half.
    assert.equal(sigA.split(".")[0], sigB.split(".")[0]);
    assert.notEqual(sigA.split(".")[1], sigB.split(".")[1]);
  });
});

describe("CertificateService.verify — state short-circuits before HMAC", () => {
  it("an unknown cert number returns not_found", async () => {
    const { svc } = setup();
    const result = await svc.verify("HV-2026-NOPE0000");
    assert.equal(result.valid, false);
    if (!result.valid) assert.equal(result.reason, "not_found");
  });

  it("a revoked cert returns revoked even with a valid signature", async () => {
    const { svc, storeCert } = setup();
    const { certNumber } = await storeCert(basePayload, { revokedAt: new Date("2026-06-06T00:00:00Z") });
    const result = await svc.verify(certNumber);
    assert.equal(result.valid, false);
    if (!result.valid) assert.equal(result.reason, "revoked");
  });

  it("an expired cert returns expired even with a valid signature", async () => {
    const { svc, storeCert } = setup();
    const { certNumber } = await storeCert(basePayload, { expiresAt: new Date("2020-01-01T00:00:00Z") });
    const result = await svc.verify(certNumber);
    assert.equal(result.valid, false);
    if (!result.valid) assert.equal(result.reason, "expired");
  });

  it("a not-yet-expired cert (future expiry) still verifies", async () => {
    const { svc, storeCert } = setup();
    const { certNumber } = await storeCert(basePayload, { expiresAt: new Date("2099-01-01T00:00:00Z") });
    const result = await svc.verify(certNumber);
    assert.equal(result.valid, true);
  });
});
