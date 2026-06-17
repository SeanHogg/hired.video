/**
 * Certificate issuance for course / learning-path completion (#165).
 *
 * Signed payload uses HMAC-SHA256 over a canonical JSON blob. The
 * verify endpoint (`GET /api/verify/:certNumber`) re-derives the same
 * HMAC and rejects mismatches. We use HMAC rather than Ed25519 at the
 * MVP layer because the secret already exists (JWT signing secret); a
 * future migration to Ed25519 with a published JWKS endpoint can swap
 * the algorithm without changing the schema (signed_payload is opaque
 * to the DB).
 *
 * Cert numbers are short + human-shareable: `HV-YYYY-XXXXXXXX` where
 * XXXXXXXX is a Base32 uuid slice. Postgres unique constraint catches
 * the (vanishingly rare) collision.
 */

import { and, eq } from "drizzle-orm";
import type { getDb } from "../../db/index.js";
import { schema } from "../../db/index.js";
import { NotificationService } from "../notifications/notificationService.js";

type DbHandle = ReturnType<typeof getDb>;

const { courseCertificates, courseEnrollments, courses, users } = schema;

interface SignedPayload {
  certNumber: string;
  courseId: string;
  userId: string;
  issuedAt: string;
  recipientName: string;
  courseTitle: string;
  finalScorePct: number | null;
}

/** #1500 — optional Ed25519 keys for asymmetric cert signing. PKCS8 (private)
 *  + raw (public), both base64. Resolved from injected opts first (tests),
 *  then env (`CERT_ED25519_PRIVATE_KEY` / `CERT_ED25519_PUBLIC_KEY`). When
 *  neither is present the service stays on HMAC exactly as before — the
 *  asymmetric path is fully dormant until an operator provisions a keypair. */
export interface CertificateServiceOpts {
  ed25519?: { privateKeyPkcs8B64?: string | null; publicKeyRawB64?: string | null };
}

function readCertEnv(name: string): string | null {
  const fromGlobalEnv = (globalThis as unknown as { __ENV?: Record<string, string | undefined> }).__ENV?.[name];
  const fromGlobal = (globalThis as unknown as Record<string, string | undefined>)[name];
  const fromProcess =
    typeof process !== "undefined" ? (process.env as Record<string, string | undefined>)?.[name] : undefined;
  return fromGlobalEnv ?? fromGlobal ?? fromProcess ?? null;
}

export class CertificateService {
  private readonly edPrivateKeyB64: string | null;
  private readonly edPublicKeyB64: string | null;

  constructor(
    private readonly db: DbHandle,
    private readonly secret: string,
    opts: CertificateServiceOpts = {},
  ) {
    this.edPrivateKeyB64 = opts.ed25519?.privateKeyPkcs8B64 ?? readCertEnv("CERT_ED25519_PRIVATE_KEY");
    this.edPublicKeyB64 = opts.ed25519?.publicKeyRawB64 ?? readCertEnv("CERT_ED25519_PUBLIC_KEY");
  }

  /** Issue (or return the existing) certificate for a passed enrollment.
   *  Idempotent — re-issue returns the existing row. Returns null when
   *  the enrollment isn't passed, the course doesn't issue certificates,
   *  or the enrollment isn't found. Caller-bound: only the owner of the
   *  enrollment can hit this path. */
  async issueForEnrollment(
    userId: string,
    enrollmentId: string,
  ): Promise<{ certificate: typeof courseCertificates.$inferSelect; newlyIssued: boolean } | null> {
    return this._issueFor(enrollmentId, userId);
  }

  /** Admin / system backfill (#1567). Re-issues certs for enrollments
   *  that the migration-0137 backfill flipped to `passed=true` after the
   *  fact — those rows can't reach the JWT signer from SQL, so this
   *  method walks them per-enrollment server-side. Idempotent via the
   *  existing `_issueFor` body. NEVER expose to non-admin callers; the
   *  admin route at [admin-courses-certs.ts](../../routes/admin-courses-certs.ts)
   *  is the only callsite. */
  async issueForEnrollmentAsAdmin(
    enrollmentId: string,
  ): Promise<{ certificate: typeof courseCertificates.$inferSelect; newlyIssued: boolean } | null> {
    return this._issueFor(enrollmentId);
  }

  // Shared body — fetch the enrollment + course + user, optionally
  // filtered to the calling user, then run the issuance logic. Single
  // seam means /enrollments/:id/certificate (user) and the admin
  // backfill always sign over the same canonical payload.
  private async _issueFor(
    enrollmentId: string,
    userId?: string,
  ): Promise<{ certificate: typeof courseCertificates.$inferSelect; newlyIssued: boolean } | null> {
    const whereClause = userId
      ? and(eq(courseEnrollments.id, enrollmentId), eq(courseEnrollments.userId, userId))
      : eq(courseEnrollments.id, enrollmentId);

    const [row] = await this.db
      .select({
        enrollment: courseEnrollments,
        course: courses,
        user: { id: users.id, name: users.name },
      })
      .from(courseEnrollments)
      .innerJoin(courses, eq(courseEnrollments.courseId, courses.id))
      .innerJoin(users, eq(courseEnrollments.userId, users.id))
      .where(whereClause)
      .limit(1);
    if (!row) return null;
    if (!row.enrollment.passed) return null;
    if (!row.course.issuesCertificate) return null;

    const [existing] = await this.db
      .select()
      .from(courseCertificates)
      .where(eq(courseCertificates.enrollmentId, enrollmentId))
      .limit(1);
    if (existing) return { certificate: existing, newlyIssued: false };

    const certNumber = makeCertNumber();
    const issuedAt = new Date();
    const payload: SignedPayload = {
      certNumber,
      courseId: row.course.id,
      userId: row.user.id,
      issuedAt: issuedAt.toISOString(),
      recipientName: row.user.name ?? "Recipient",
      courseTitle: row.course.title,
      finalScorePct: row.enrollment.finalScorePct ?? null,
    };
    const signed = await this.sign(payload);

    const [created] = await this.db
      .insert(courseCertificates)
      .values({
        enrollmentId,
        courseId: row.course.id,
        userId: row.user.id,
        certNumber,
        issuedAt,
        signedPayload: signed,
        courseTitle: row.course.title,
        recipientName: payload.recipientName,
      } as never)
      .returning();
    // Surface in the notification center (+ push). Best-effort — never blocks
    // cert issuance.
    await NotificationService.notify({
      userId: row.user.id,
      type: "certificate",
      title: "Certificate earned 🎓",
      message: `You earned a verifiable certificate for "${row.course.title}".`,
      url: `/verify/${certNumber}`,
      refType: "certificate",
      refId: created?.id,
    }).catch(() => undefined);
    return { certificate: created, newlyIssued: true };
  }

  /** Admin revocation. Stamps `revoked_at` + `revoked_reason`; the next
   *  public verify against the cert number returns `{valid:false, reason:"revoked"}`.
   *  Idempotent — re-running with the same cert number is a no-op when
   *  the cert is already revoked. Caller is responsible for authorising
   *  (SuperAdmin middleware on the admin route is the SSoT).
   *  Returns the post-update row, or null when the cert number isn't found. */
  async revokeByCertNumber(
    certNumber: string,
    reason: string,
  ): Promise<typeof courseCertificates.$inferSelect | null> {
    const [cert] = await this.db.select()
      .from(courseCertificates)
      .where(eq(courseCertificates.certNumber, certNumber))
      .limit(1);
    if (!cert) return null;
    if (cert.revokedAt) return cert;
    const [updated] = await this.db.update(courseCertificates)
      .set({ revokedAt: new Date(), revokedReason: reason } as never)
      .where(eq(courseCertificates.id, cert.id))
      .returning();
    return updated ?? cert;
  }

  /** Public verify entry. Reads the cert, re-derives the HMAC, returns
   *  `valid: true` only when the stored signature matches the canonical
   *  payload AND the cert isn't revoked / expired. */
  async verify(certNumber: string): Promise<
    | { valid: false; reason: "not_found" | "tampered" | "revoked" | "expired" }
    | { valid: true; certificate: typeof courseCertificates.$inferSelect; payload: SignedPayload }
  > {
    const [cert] = await this.db
      .select()
      .from(courseCertificates)
      .where(eq(courseCertificates.certNumber, certNumber))
      .limit(1);
    if (!cert) return { valid: false, reason: "not_found" };
    if (cert.revokedAt) return { valid: false, reason: "revoked" };
    if (cert.expiresAt && cert.expiresAt < new Date()) {
      return { valid: false, reason: "expired" };
    }

    // Format discrimination (#1500): `${b64}.${sig}` = HMAC (default/legacy);
    // `${b64}.${sig}.ed25519` = asymmetric. base64url has no ".", so every
    // existing 2-part cert deterministically takes the unchanged HMAC path.
    const [b64, sig, alg] = cert.signedPayload.split(".");
    if (!b64 || !sig) return { valid: false, reason: "tampered" };
    let payload: SignedPayload;
    try {
      payload = JSON.parse(base64UrlDecode(b64)) as SignedPayload;
    } catch {
      return { valid: false, reason: "tampered" };
    }
    const signatureOk =
      alg === "ed25519"
        ? await this.verifyEd25519(b64, sig)
        : constantTimeEqual(sig, await this.hmac(b64));
    if (!signatureOk) {
      return { valid: false, reason: "tampered" };
    }
    return { valid: true, certificate: cert, payload };
  }

  // ── crypto helpers ────────────────────────────────────────────────

  private async sign(payload: SignedPayload): Promise<string> {
    const canonical = canonicalJson(payload as unknown as Record<string, unknown>);
    const b64 = base64UrlEncode(canonical);
    // Prefer Ed25519 when a keypair is provisioned (off-platform-verifiable
    // via the JWKS endpoint); the 3-part suffix tells verify() which alg to
    // use. Falls back to same-origin HMAC otherwise (#1500).
    if (this.edPrivateKeyB64) {
      return `${b64}.${await this.signEd25519(b64)}.ed25519`;
    }
    const sig = await this.hmac(b64);
    return `${b64}.${sig}`;
  }

  private async hmac(message: string): Promise<string> {
    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(this.secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );
    const bytes = new Uint8Array(
      await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message)),
    );
    return base64UrlEncode(bytes);
  }

  // ── Ed25519 (asymmetric) helpers (#1500) ──────────────────────────────

  private edPrivateKeyPromise: Promise<CryptoKey> | null = null;
  private edPublicKeyPromise: Promise<CryptoKey | null> | null = null;

  private edPrivateKey(): Promise<CryptoKey> {
    if (!this.edPrivateKeyB64) return Promise.reject(new Error("Ed25519 private key not configured"));
    if (!this.edPrivateKeyPromise) {
      this.edPrivateKeyPromise = crypto.subtle.importKey(
        "pkcs8",
        base64ToBytes(this.edPrivateKeyB64),
        { name: "Ed25519" },
        false,
        ["sign"],
      );
    }
    return this.edPrivateKeyPromise;
  }

  private edPublicKey(): Promise<CryptoKey | null> {
    if (!this.edPublicKeyB64) return Promise.resolve(null);
    if (!this.edPublicKeyPromise) {
      this.edPublicKeyPromise = crypto.subtle
        .importKey("raw", base64ToBytes(this.edPublicKeyB64), { name: "Ed25519" }, true, ["verify"])
        .catch(() => null);
    }
    return this.edPublicKeyPromise;
  }

  private async signEd25519(message: string): Promise<string> {
    const key = await this.edPrivateKey();
    const bytes = new Uint8Array(
      await crypto.subtle.sign({ name: "Ed25519" }, key, new TextEncoder().encode(message)),
    );
    return base64UrlEncode(bytes);
  }

  private async verifyEd25519(message: string, sigB64Url: string): Promise<boolean> {
    const key = await this.edPublicKey();
    if (!key) return false; // can't verify an ed25519 cert without the public key
    try {
      return await crypto.subtle.verify(
        { name: "Ed25519" },
        key,
        base64UrlToBytes(sigB64Url),
        new TextEncoder().encode(message),
      );
    } catch {
      return false;
    }
  }

  /** #1500 — the published verification key as a JWK for the JWKS endpoint
   *  (`GET /api/verify/.well-known/jwks.json`). Null when no Ed25519 public
   *  key is configured (verify stays on the same-origin HMAC path). */
  async publicJwk(): Promise<Record<string, unknown> | null> {
    const key = await this.edPublicKey();
    if (!key) return null;
    const jwk = (await crypto.subtle.exportKey("jwk", key)) as unknown as Record<string, unknown>;
    return { ...jwk, alg: "EdDSA", use: "sig", kid: "hv-cert-ed25519-1" };
  }
}

// ── utilities ────────────────────────────────────────────────────────

function makeCertNumber(): string {
  const year = new Date().getUTCFullYear();
  const id = crypto.randomUUID().replace(/-/g, "").slice(0, 8).toUpperCase();
  return `HV-${year}-${id}`;
}

function canonicalJson(obj: Record<string, unknown>): string {
  const keys = Object.keys(obj).sort();
  const ordered: Record<string, unknown> = {};
  for (const k of keys) ordered[k] = obj[k];
  return JSON.stringify(ordered);
}

function base64UrlEncode(input: string | Uint8Array): string {
  const bytes = typeof input === "string" ? new TextEncoder().encode(input) : input;
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]!);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlDecode(input: string): string {
  const padded = input.replace(/-/g, "+").replace(/_/g, "/") +
    "=".repeat((4 - (input.length % 4)) % 4);
  const bin = atob(padded);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

/** Decode standard base64 (e.g. a stored PKCS8/raw key) to bytes. */
function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

/** Decode base64url (the signature segment) to bytes. */
function base64UrlToBytes(b64url: string): Uint8Array {
  const padded =
    b64url.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (b64url.length % 4)) % 4);
  return base64ToBytes(padded);
}
