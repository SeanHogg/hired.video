/**
 * SCORM runtime use cases: CMI commit / read (#161) and the same-origin
 * package asset fetch (#1460) behind GET /api/courses/scorm-asset/*.
 */
import { getDb } from "../../db/index.js";
import { DomainError } from "../../domains/errors.js";
import { findEnrollmentForUser } from "../../repositories/courseEnrollmentsRepository.js";
import { lessonBelongsToCourse } from "../../repositories/courseContentRepository.js";
import { findCmiState, insertCmiState, updateCmiState } from "../../repositories/scormRepository.js";
import { getVideoBucket } from "../storage/object-store.js";
import { invalidateLearnerCohortCaches } from "./courseAccess.js";

export interface ScormCommitInput {
  lessonId: string;
  scormVersion: string;
  cmi: Record<string, unknown>;
  completionStatus?: string;
  scoreRaw?: number;
  scoreMin?: number;
  scoreMax?: number;
  totalTimeSec?: number;
  suspendData?: string;
}

/** Upsert the (enrollment, lesson) CMI row. `created` drives 201 vs 200. */
export async function commitScormState(userId: string, enrollmentId: string, input: ScormCommitInput) {
  const db = getDb();
  const enrollment = await findEnrollmentForUser(db, enrollmentId, userId);
  if (!enrollment) throw new DomainError(404, "NOT_FOUND", "Enrollment not found");
  if (!(await lessonBelongsToCourse(db, input.lessonId, enrollment.courseId))) {
    throw new DomainError(404, "NOT_FOUND", "Lesson not found on this course");
  }

  const existing = await findCmiState(db, enrollmentId, input.lessonId);
  if (existing) {
    const updated = await updateCmiState(db, existing.id, {
      cmi: input.cmi,
      completionStatus: input.completionStatus ?? existing.completionStatus,
      scoreRaw: input.scoreRaw ?? existing.scoreRaw,
      scoreMin: input.scoreMin ?? existing.scoreMin,
      scoreMax: input.scoreMax ?? existing.scoreMax,
      totalTimeSec: input.totalTimeSec ?? existing.totalTimeSec,
      suspendData: input.suspendData ?? existing.suspendData,
      scormVersion: input.scormVersion,
      updatedAt: new Date(),
    });
    await invalidateLearnerCohortCaches(db, userId);
    return { state: updated, created: false };
  }

  const created = await insertCmiState(db, {
    enrollmentId,
    lessonId: input.lessonId,
    scormVersion: input.scormVersion,
    cmi: input.cmi,
    completionStatus: input.completionStatus ?? null,
    scoreRaw: input.scoreRaw ?? null,
    scoreMin: input.scoreMin ?? null,
    scoreMax: input.scoreMax ?? null,
    totalTimeSec: input.totalTimeSec ?? 0,
    suspendData: input.suspendData ?? null,
  });
  await invalidateLearnerCohortCaches(db, userId);
  return { state: created, created: true };
}

/** The saved CMI state for resume, or null; 404 when the enrolment isn't the caller's. */
export async function getScormState(userId: string, enrollmentId: string, lessonId: string) {
  const db = getDb();
  const enrollment = await findEnrollmentForUser(db, enrollmentId, userId);
  if (!enrollment) throw new DomainError(404, "NOT_FOUND", "Enrollment not found");
  return findCmiState(db, enrollmentId, lessonId);
}

const UUID_RE = /^[0-9a-f-]{36}$/i;

/** Mirror the upload route's validation: uuids + a traversal-free relative path. */
function assertSafeAssetPath(userId: string, pkgId: string, relPath: string): void {
  if (!UUID_RE.test(userId) || !UUID_RE.test(pkgId)) {
    throw new DomainError(400, "VALIDATION_ERROR", "userId / pkgId must be uuids");
  }
  if (!relPath
      || relPath.startsWith("/")
      || relPath.includes("\\")
      || relPath.split("/").some((seg) => seg === "" || seg === ".." || seg === ".")) {
    throw new DomainError(400, "VALIDATION_ERROR", "path must be traversal-free");
  }
}

/** Fetch `uploads/<userId>/scorm/<pkgId>/<relPath>` from R2 with its stored MIME. */
export async function fetchScormAsset(userId: string, pkgId: string, relPath: string) {
  assertSafeAssetPath(userId, pkgId, relPath);
  const bucket: R2Bucket | undefined = getVideoBucket();
  if (!bucket) throw new DomainError(500, "INTERNAL_SERVER_ERROR", "Storage not configured");
  const obj = await bucket.get(`uploads/${userId}/scorm/${pkgId}/${relPath}`);
  if (!obj) throw new DomainError(404, "NOT_FOUND", "Asset not found");
  return {
    body: obj.body,
    contentType: obj.httpMetadata?.contentType ?? "application/octet-stream",
  };
}
