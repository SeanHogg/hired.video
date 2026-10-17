/**
 * Learner enrolment use cases: enrol / unenrol, my enrolments, the
 * learner content fetch, prerequisites (DAG edges) and certificates.
 * Progress writes + their completion fan-out live in courseProgressService.
 */
import { getDb } from "../../db/index.js";
import { DomainError } from "../../domains/errors.js";
import { findCourseById, findPublishedCourseById, courseExists, decrementEnrollmentCount, incrementEnrollmentCount, listCourseSummariesByIds } from "../../repositories/coursesRepository.js";
import {
  countLessonsByCourse,
  findStudioSlugsByProjectIds,
  listCourseLessons,
  listCourseModules,
} from "../../repositories/courseContentRepository.js";
import {
  deleteEnrollmentById,
  enrollmentHasCertificate,
  findCertificateSummaryForEnrollment,
  findEnrollmentByUserAndCourse,
  findEnrollmentForUser,
  insertEnrollment,
  listCertificatesForUser,
  listEnrollmentsWithCourse,
} from "../../repositories/courseEnrollmentsRepository.js";
import { LearningPathService } from "../learning/learning-path-service.js";
import { CertificateService } from "../learning/certificate-service.js";
import { invalidateLearnerDashboard } from "../learning/learner-dashboard.js";
import { getJwtSecret } from "../../utils/jwt.js";
import { assertCanEditCourse, type CourseActor } from "./courseAccess.js";

/** Enrol in a published free course. Idempotent: `created` is false when
 *  the caller was already enrolled (route maps to 200 vs 201). */
export async function enrollInCourse(userId: string, courseId: string) {
  const db = getDb();
  const course = await findPublishedCourseById(db, courseId);
  if (!course) throw new DomainError(404, "NOT_FOUND", "Course not found");

  // Prerequisite gate — every direct prereq must already be passed.
  const unlockState = await new LearningPathService(db).computeUnlockState(userId, [course.id]);
  if (!unlockState.unlocked.has(course.id)) {
    const missing = unlockState.locked.get(course.id) ?? [];
    throw new DomainError(409, "PREREQUISITES_NOT_MET", `Pass the prerequisite course(s) first: ${missing.join(", ")}`);
  }

  // Paid enrolment routes through POST /api/checkout {kind:"course"}.
  if (course.priceCents > 0) {
    throw new DomainError(
      402,
      "PAYMENT_REQUIRED",
      `This course costs ${(course.priceCents / 100).toFixed(2)} ${course.priceVisible ? "USD" : ""}. POST /api/checkout {kind:"course"} to begin checkout.`,
      { courseId: course.id, priceCents: course.priceCents },
    );
  }

  const existing = await findEnrollmentByUserAndCourse(db, userId, course.id);
  if (existing) return { enrollment: existing, created: false };

  const created = await insertEnrollment(db, { courseId: course.id, userId });
  await incrementEnrollmentCount(db, course.id);
  invalidateLearnerDashboard(userId);
  return { enrollment: created, created: true };
}

/** Unenrol (cascades progress + CMI + xAPI). Refused once a certificate
 *  exists — revoking a real-world credential by accident is unrecoverable. */
export async function unenrollFromCourse(userId: string, courseId: string): Promise<void> {
  const db = getDb();
  const existing = await findEnrollmentByUserAndCourse(db, userId, courseId);
  if (!existing) throw new DomainError(404, "NOT_FOUND", "You are not enrolled in this course");
  if (await enrollmentHasCertificate(db, existing.id)) {
    throw new DomainError(
      409,
      "CERTIFICATE_ISSUED",
      "You can't unenroll — a certificate has already been issued for this course. Contact support if you need this removed.",
    );
  }
  await deleteEnrollmentById(db, existing.id);
  await decrementEnrollmentCount(db, existing.courseId);
  invalidateLearnerDashboard(userId);
}

/** #1462 — my enrolments annotated with totalLessons + passedLessons
 *  (one grouped count query, O(1) regardless of enrolment count). */
export async function listMyEnrollments(userId: string) {
  const db = getDb();
  const rows = await listEnrollmentsWithCourse(db, userId);
  const courseIds = Array.from(new Set(rows.map((r) => r.course.id)));
  const totalsByCourse = await countLessonsByCourse(db, courseIds);
  return rows.map((r) => {
    const total = totalsByCourse.get(r.course.id) ?? 0;
    const progress = (r.enrollment.progress ?? {}) as Record<string, { status?: string }>;
    const passed = Object.values(progress).filter((p) => p?.status === "passed").length;
    return { ...r, totalLessons: total, passedLessons: passed };
  });
}

/** Learner full content fetch, gated on owning the enrolment. Studio-video
 *  lessons carry their published studio slug (#1464, batched). */
export async function getEnrollmentContent(userId: string, enrollmentId: string) {
  const db = getDb();
  const enrollment = await findEnrollmentForUser(db, enrollmentId, userId);
  if (!enrollment) throw new DomainError(404, "NOT_FOUND", "Enrollment not found");
  const course = await findCourseById(db, enrollment.courseId);
  if (!course) throw new DomainError(404, "NOT_FOUND", "Course not found");

  const modules = await listCourseModules(db, course.id);
  const lessonRows = await listCourseLessons(db, course.id);
  const studioProjectIds = Array.from(new Set(
    lessonRows
      .filter((l) => l.sourceType === "studio_video" && l.studioProjectId)
      .map((l) => l.studioProjectId as string),
  ));
  const slugByProjectId = await findStudioSlugsByProjectIds(db, studioProjectIds);
  const lessons = lessonRows.map((l) => ({
    ...l,
    studioSlug:
      l.sourceType === "studio_video" && l.studioProjectId
        ? slugByProjectId.get(l.studioProjectId) ?? null
        : null,
  }));
  const certificate = await findCertificateSummaryForEnrollment(db, enrollment.id);
  return { enrollment, course, modules, lessons, certificate: certificate ?? null };
}

// ---------------------------------------------------------------------------
// Prerequisites
// ---------------------------------------------------------------------------

export async function listCoursePrerequisites(courseId: string) {
  const db = getDb();
  const prereqIds = await new LearningPathService(db).listPrerequisites(courseId);
  if (prereqIds.length === 0) return [];
  return listCourseSummariesByIds(db, prereqIds);
}

/** Add a prereq edge (cycle-safe). Cross-author / draft prereqs allowed. */
export async function addCoursePrerequisite(actor: CourseActor, courseId: string, prerequisiteCourseId: string) {
  const db = getDb();
  await assertCanEditCourse(db, actor, courseId);
  if (!(await courseExists(db, prerequisiteCourseId))) {
    throw new DomainError(400, "VALIDATION_ERROR", "Prerequisite course not found");
  }
  try {
    return await new LearningPathService(db).addPrerequisite(courseId, prerequisiteCourseId);
  } catch (e) {
    throw new DomainError(409, "CYCLE", e instanceof Error ? e.message : "Cycle");
  }
}

export async function removeCoursePrerequisite(actor: CourseActor, courseId: string, prereqId: string) {
  const db = getDb();
  await assertCanEditCourse(db, actor, courseId);
  return new LearningPathService(db).removePrerequisite(courseId, prereqId);
}

// ---------------------------------------------------------------------------
// Certificates
// ---------------------------------------------------------------------------

export async function issueEnrollmentCertificate(userId: string, enrollmentId: string) {
  const result = await new CertificateService(getDb(), getJwtSecret()).issueForEnrollment(userId, enrollmentId);
  if (!result) {
    throw new DomainError(409, "NOT_ELIGIBLE", "Enrollment is not eligible for a certificate (must be passed, and the course must issue certs).");
  }
  return result;
}

export function listMyCertificates(userId: string) {
  return listCertificatesForUser(getDb(), userId);
}
