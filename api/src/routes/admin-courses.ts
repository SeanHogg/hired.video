/**
 * Admin-only course administration — currently scopes to the gap #1567
 * cert-backfill endpoint. Mounted at `/api/admin/courses/*`. Every route
 * here requires the `superAdminMiddleware`.
 *
 * Why a separate file: the consumer route surface for courses
 * ([courses.ts](./courses.ts)) is already ~1500 lines and owns the
 * learner + author lifecycle. Admin-only operations belong out of band
 * so the consumer route schema doesn't have to spread auth-mode
 * branching across every handler.
 */

import { Hono } from "hono";
import { and, eq, isNotNull, isNull } from "drizzle-orm";
import { z } from "zod";
import type { AppEnv } from "../types/index.js";
import { getDb, schema } from "../db/index.js";
import { superAdminMiddleware } from "../middleware/superAdmin.js";
import { ok } from "../utils/response.js";
import { error } from "../types/index.js";
import { CertificateService } from "../services/learning/certificate-service.js";
import { getJwtSecret } from "../utils/jwt.js";

export const adminCourseRoutes = new Hono<AppEnv>();

adminCourseRoutes.use("*", superAdminMiddleware);

/**
 * POST /api/admin/courses/issue-backfill-certs
 *
 * Iterates every `course_enrollments` row that is `passed` + has no
 * `courseCertificates` row + whose course `issues_certificate = true`,
 * and calls `CertificateService.issueForEnrollmentAsAdmin` per row.
 *
 * Why this route exists: migration 0137 (#1566) retroactively flipped
 * stuck enrollments to `passed = true`, but SQL can't reach the JWT
 * signer, so certs were intentionally deferred. The auto-issue path on
 * [CourseLearner](../../../frontend/pages/CourseLearner.tsx) catches up
 * any learner who revisits; this route catches the rest in one sweep.
 *
 * **Badges are deliberately NOT re-fired** — the gamification engine
 * uses the JWT-bound user to attribute the award, and the admin running
 * the backfill isn't the learner. Re-firing badges per-learner without
 * a JWT means a parallel path through `GamificationService` that hasn't
 * been hardened; tracked as a follow-up in [#1568](../../../README.md)
 * if the celebration-toast gap matters for backfilled certs.
 *
 * Idempotent on the cert side via the underlying `_issueFor` check —
 * re-running the route is safe and reports `newlyIssued` per row so the
 * caller can see how many actually flipped.
 */
adminCourseRoutes.post("/issue-backfill-certs", async (c) => {
  const db = getDb();
  const certService = new CertificateService(db, getJwtSecret());
  void c; // marker that the SuperAdmin context check ran via middleware


  // Find every passed enrollment whose course issues certs and whose
  // cert row is missing. Left join on courseCertificates so the WHERE
  // can filter on `certs.id IS NULL`.
  const candidates = await db
    .select({
      enrollmentId: schema.courseEnrollments.id,
      userId: schema.courseEnrollments.userId,
      courseId: schema.courseEnrollments.courseId,
    })
    .from(schema.courseEnrollments)
    .innerJoin(schema.courses, eq(schema.courses.id, schema.courseEnrollments.courseId))
    .leftJoin(
      schema.courseCertificates,
      eq(schema.courseCertificates.enrollmentId, schema.courseEnrollments.id),
    )
    .where(and(
      eq(schema.courseEnrollments.passed, true),
      isNotNull(schema.courseEnrollments.completedAt),
      eq(schema.courses.issuesCertificate, true),
      isNull(schema.courseCertificates.id),
    ));

  // Issue per-enrollment. Errors per-row are swallowed so a single
  // tampered/broken row doesn't kill the sweep — we collect and report.
  let issued = 0;
  let alreadyIssued = 0;
  const failed: { enrollmentId: string; error: string }[] = [];
  for (const candidate of candidates) {
    try {
      const result = await certService.issueForEnrollmentAsAdmin(candidate.enrollmentId);
      if (result?.newlyIssued) issued++;
      else if (result) alreadyIssued++;
    } catch (e) {
      failed.push({
        enrollmentId: candidate.enrollmentId,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  return c.json(ok({
    scanned: candidates.length,
    issued,
    alreadyIssued,
    failed,
  }));
});

/**
 * POST /api/admin/courses/certificates/:certNumber/revoke
 *
 * Revoke an issued certificate by cert number. Sets `revoked_at` + the
 * supplied `reason` so the public verify path (`GET /api/verify/:certNumber`)
 * starts returning `{ valid: false, reason: "revoked" }`. Idempotent —
 * re-revoking a revoked cert is a no-op and returns the existing row.
 *
 * Reason text is recorded as-is so a future admin reviewing the
 * revocation has the original justification (fraud, plagiarism,
 * mistaken issuance, etc.). The schema's existing
 * `uq_course_certificates_active_enrollment` partial unique index
 * already lets a re-grant insert a fresh active cert against the same
 * enrollment once this row is revoked.
 */
const RevokeSchema = z.object({
  reason: z.string().min(1).max(1000),
});

adminCourseRoutes.post("/certificates/:certNumber/revoke", async (c) => {
  const parsed = RevokeSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) {
    return c.json(error("VALIDATION_ERROR", parsed.error.issues[0]?.message ?? "Invalid body"), 400);
  }
  const db = getDb();
  const certService = new CertificateService(db, getJwtSecret());
  const result = await certService.revokeByCertNumber(c.req.param("certNumber"), parsed.data.reason);
  if (!result) return c.json(error("NOT_FOUND", "Certificate not found"), 404);
  return c.json(ok({ certificate: result }), 200);
});
