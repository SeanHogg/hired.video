/**
 * AdminCourseCertService — SuperAdmin certificate operations: the gap #1567
 * cert backfill sweep and revocation by cert number.
 */
import { and, eq, isNotNull, isNull } from "drizzle-orm";
import { getDb, schema } from "../../db/index.js";
import { CertificateService } from "../learning/certificate-service.js";
import { getJwtSecret } from "../../utils/jwt.js";
import type { GamificationService } from "../../domains/gamification/index.js";

type DbHandle = ReturnType<typeof getDb>;

export interface BackfillReport {
  scanned: number;
  issued: number;
  alreadyIssued: number;
  failed: { enrollmentId: string; error: string }[];
}

export class AdminCourseCertService {
  constructor(private readonly db: DbHandle, private readonly certs: CertificateService) {}

  static create(): AdminCourseCertService {
    const db = getDb();
    return new AdminCourseCertService(db, new CertificateService(db, getJwtSecret()));
  }

  /** Passed + completed enrollments of cert-issuing courses with no cert row. */
  private listMissingCerts() {
    const { courseEnrollments, courses, courseCertificates } = schema;
    return this.db
      .select({
        enrollmentId: courseEnrollments.id,
        userId: courseEnrollments.userId,
        courseId: courseEnrollments.courseId,
      })
      .from(courseEnrollments)
      .innerJoin(courses, eq(courses.id, courseEnrollments.courseId))
      .leftJoin(courseCertificates, eq(courseCertificates.enrollmentId, courseEnrollments.id))
      .where(and(
        eq(courseEnrollments.passed, true),
        isNotNull(courseEnrollments.completedAt),
        eq(courses.issuesCertificate, true),
        isNull(courseCertificates.id),
      ));
  }

  /**
   * Issues every missing certificate. Per-row errors are collected, not
   * thrown. For each NEWLY issued cert the LEARNER's `certificate.earned`
   * award fires by explicit userId (#1571) — best-effort, never aborts the
   * sweep. Idempotent: re-running only reports `alreadyIssued`.
   */
  async backfill(gamification: GamificationService): Promise<BackfillReport> {
    const candidates = await this.listMissingCerts();
    const report: BackfillReport = { scanned: candidates.length, issued: 0, alreadyIssued: 0, failed: [] };
    for (const candidate of candidates) {
      try {
        const result = await this.certs.issueForEnrollmentAsAdmin(candidate.enrollmentId);
        if (result?.newlyIssued) {
          report.issued++;
          await gamification
            .awardWithRoleLookup("certificate.earned", {
              userId: candidate.userId,
              refId: result.certificate.id,
              refType: "course_certificate",
            })
            .catch(() => undefined);
        } else if (result) report.alreadyIssued++;
      } catch (e) {
        report.failed.push({ enrollmentId: candidate.enrollmentId, error: e instanceof Error ? e.message : String(e) });
      }
    }
    return report;
  }

  revoke(certNumber: string, reason: string) {
    return this.certs.revokeByCertNumber(certNumber, reason);
  }
}
