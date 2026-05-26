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

export class CertificateService {
  constructor(
    private readonly db: DbHandle,
    private readonly secret: string,
  ) {}

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
    return { certificate: created, newlyIssued: true };
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

    // Cert payload is encoded as `${base64url(canonicalJson)}.${hmac}`
    const [b64, sig] = cert.signedPayload.split(".");
    if (!b64 || !sig) return { valid: false, reason: "tampered" };
    let payload: SignedPayload;
    try {
      payload = JSON.parse(base64UrlDecode(b64)) as SignedPayload;
    } catch {
      return { valid: false, reason: "tampered" };
    }
    const expectedSig = await this.hmac(b64);
    if (!constantTimeEqual(sig, expectedSig)) {
      return { valid: false, reason: "tampered" };
    }
    return { valid: true, certificate: cert, payload };
  }

  // ── crypto helpers ────────────────────────────────────────────────

  private async sign(payload: SignedPayload): Promise<string> {
    const canonical = canonicalJson(payload as unknown as Record<string, unknown>);
    const b64 = base64UrlEncode(canonical);
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
