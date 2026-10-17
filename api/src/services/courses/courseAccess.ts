/**
 * Course access seams shared by every /api/courses use case:
 *   - `CourseActor` — the framework-free caller identity (id, roles, SA flag);
 *   - `canEditCourse` — owner OR SuperAdmin may mutate a course;
 *   - `resolveCourseAuthorEligibility` — creator-program / employer gate;
 *   - `invalidateLearnerCohortCaches` — #1892 eager cache bust after a
 *     learner progress / SCORM write.
 */
import type { Db } from "../../db/index.js";
import { DomainError } from "../../domains/errors.js";
import { courseExists, courseOwnedBy } from "../../repositories/coursesRepository.js";
import { listActiveCohortIdsForUser } from "../../repositories/courseEnrollmentsRepository.js";
import { resolveAuthorEligibility } from "../learning/author-eligibility.js";
import { invalidateCohortAnalyticsCache } from "../learning/cohort-analytics.js";
import { invalidateLearnerDashboard } from "../learning/learner-dashboard.js";
import { logger } from "../../lib/logger.js";

export interface CourseActor {
  userId: string;
  roles: string[];
  isSuperAdmin: boolean;
}

/** Single seam: caller may mutate this course because they own it OR
 *  they're a SuperAdmin. Impersonation tokens that have already swapped
 *  `sub` to the target user pass via ownership; raw SuperAdmin tokens pass
 *  via `isSuperAdmin`. Never compute this inline at a call site. */
export async function canEditCourse(db: Db, actor: CourseActor, courseId: string): Promise<boolean> {
  if (await courseOwnedBy(db, actor.userId, courseId)) return true;
  if (!actor.isSuperAdmin) return false;
  return courseExists(db, courseId);
}

/** Throws the route's historical 404 when the caller can't edit `courseId`. */
export async function assertCanEditCourse(
  db: Db,
  actor: CourseActor,
  courseId: string,
  notFoundMessage = "Course not found",
): Promise<void> {
  if (!(await canEditCourse(db, actor, courseId))) {
    throw new DomainError(404, "NOT_FOUND", notFoundMessage);
  }
}

/** Authoring eligibility for courses — adapter over the shared
 *  services/learning/author-eligibility seam. */
export function resolveCourseAuthorEligibility(db: Db, actor: CourseActor) {
  return resolveAuthorEligibility(db, actor.userId, actor.roles);
}

/** #1892 — After a learner progress / SCORM write, eagerly invalidate the
 *  educator cohort-analytics cache for every cohort the user is an active
 *  member of, so a finished lesson surfaces in the educator grid
 *  immediately instead of after the 45s TTL. Best-effort: any failure is
 *  swallowed so it can never break the write that already succeeded. */
export async function invalidateLearnerCohortCaches(db: Db, userId: string): Promise<void> {
  invalidateLearnerDashboard(userId);
  try {
    const cohortIds = await listActiveCohortIdsForUser(db, userId);
    for (const cohortId of cohortIds) {
      invalidateCohortAnalyticsCache(cohortId);
    }
  } catch (e) {
    logger.warn("[courses] cohort-analytics cache invalidation failed", {
      error: e instanceof Error ? e.message : String(e),
    });
  }
}
