/**
 * PATCH /api/courses/enrollments/:enrollmentId/progress use case: merge a
 * lesson's progress, evaluate course completion, then fan out on the
 * transition (gamification, completion counter, notification, cert
 * issuance, cohort-assignment credit, learning-path completion) and bust
 * the educator cohort-analytics caches (#1892).
 *
 * Gamification is request-scoped (JWT role + worker env), so the route
 * passes a `LearnerGamification` port instead of the Hono context.
 */
import { getDb, type Db } from "../../db/index.js";
import { DomainError } from "../../domains/errors.js";
import type { GamificationService } from "../../domains/gamification/index.js";
import type { GamificationCallback } from "../../domains/gamification/with-gamification.js";
import type { ScoringRole } from "../../../../shared/user-roles.js";
import { findCourseCompletionMeta, incrementCompletionCount } from "../../repositories/coursesRepository.js";
import { listLessonRequirements } from "../../repositories/courseContentRepository.js";
import {
  findEnrollmentForUser,
  findLearningPathTitleSlug,
  listPathIdsContainingCourse,
  updateEnrollmentById,
} from "../../repositories/courseEnrollmentsRepository.js";
import { evaluateCourseCompletion } from "../learning/course-completion.js";
import { CertificateService } from "../learning/certificate-service.js";
import { LearningPathService } from "../learning/learning-path-service.js";
import { NotificationService } from "../notifications/notificationService.js";
import { getJwtSecret } from "../../utils/jwt.js";
import { logger } from "../../lib/logger.js";
import { invalidateLearnerCohortCaches } from "./courseAccess.js";

/** Request-scoped gamification access (built by the route from its context). */
export interface LearnerGamification {
  /** Fire an award; never throws (wraps `withGamification`). */
  fire(label: string, fn: GamificationCallback): Promise<void>;
  /** The configured service (for multi-award loops inside a try/catch). */
  service(): GamificationService;
  /** Caller's scoring role, or null when they have none. */
  role: ScoringRole | null;
}

export interface ProgressUpdateInput {
  lessonId: string;
  status: "not_started" | "in_progress" | "passed" | "failed";
  scoreRaw?: number;
  scoreMax?: number;
  timeSpentSec?: number;
}

type CompletionMeta = Awaited<ReturnType<typeof findCourseCompletionMeta>>;

export async function updateLessonProgress(
  userId: string,
  enrollmentId: string,
  input: ProgressUpdateInput,
  game: LearnerGamification,
) {
  const db = getDb();
  const existing = await findEnrollmentForUser(db, enrollmentId, userId);
  if (!existing) throw new DomainError(404, "NOT_FOUND", "Enrollment not found");

  const lessonId = input.lessonId;
  const prevLessonStatus = (existing.progress?.[lessonId] as { status?: string } | undefined)?.status;
  const nextProgress = {
    ...(existing.progress ?? {}),
    [lessonId]: {
      status: input.status,
      scoreRaw: input.scoreRaw,
      scoreMax: input.scoreMax,
      timeSpentSec: input.timeSpentSec,
      lastSeenAt: new Date().toISOString(),
    },
  };

  const allLessons = await listLessonRequirements(db, existing.courseId);
  const courseRow = await findCourseCompletionMeta(db, existing.courseId);
  const completion = evaluateCourseCompletion({
    wasPassed: existing.passed,
    passingScorePct: courseRow?.passingScorePct ?? null,
    lessons: allLessons,
    progress: nextProgress as Record<string, { status?: string; scoreRaw?: number; scoreMax?: number }>,
  });
  const finalScorePct = completion.finalScorePct;
  const flipToPassed = completion.shouldFlipToPassed;

  const updated = await updateEnrollmentById(db, existing.id, {
    progress: nextProgress,
    startedAt: existing.startedAt ?? new Date(),
    completedAt: flipToPassed ? new Date() : existing.completedAt,
    passed: flipToPassed ? true : existing.passed,
    finalScorePct,
    updatedAt: new Date(),
  });

  // Only fire on transitions (not idempotent "passed again" PATCHes).
  if (input.status === "passed" && prevLessonStatus !== "passed") {
    await game.fire("lesson-completed", (g, role, uid2) =>
      g.onLessonCompleted({ userId: uid2, role, courseId: existing.courseId, lessonId, enrollmentId: existing.id }),
    );
  }

  if (flipToPassed) {
    await onCoursePassed(db, userId, existing.courseId, existing.id, finalScorePct, courseRow, game);
  }

  await invalidateLearnerCohortCaches(db, userId);
  return updated;
}

/** Everything that happens once, on the enrolment's flip to passed. */
async function onCoursePassed(
  db: Db,
  userId: string,
  courseId: string,
  enrollmentId: string,
  finalScorePct: number | null,
  courseRow: CompletionMeta,
  game: LearnerGamification,
): Promise<void> {
  await incrementCompletionCount(db, courseId);

  await game.fire("course-passed", (g, role, uid2) =>
    g.onCoursePassed({ userId: uid2, role, courseId, enrollmentId, metadata: { finalScorePct } }),
  );

  // #2068 GAP-8 — course-completed notification (preference-gated + best-effort).
  await NotificationService.notify({
    userId,
    type: "course",
    title: "Course completed",
    message: courseRow?.title ?? "You finished a course",
    url: courseRow?.slug ? `/courses/${courseRow.slug}` : "/learn/dashboard",
    refType: "course",
    refId: courseId,
  }).catch(() => undefined);

  if (courseRow?.issuesCertificate) {
    try {
      const issued = await new CertificateService(db, getJwtSecret()).issueForEnrollment(userId, enrollmentId);
      if (issued?.newlyIssued) {
        await game.fire("certificate-earned", (g, role, uid2) =>
          g.onCertificateEarned({
            userId: uid2,
            role,
            certificateId: issued.certificate.id,
            metadata: { certNumber: issued.certificate.certNumber, courseId },
          }),
        );
      }
    } catch (e) {
      logger.warn("[courses] cert issuance failed", { error: e instanceof Error ? e.message : String(e) });
    }
  }

  await creditCohortAssignments(db, userId, courseId, game);
  await completeContainingPaths(db, userId, courseId, game);
}

/** Credit every classroom assignment this course satisfies (deduped in the helper). */
async function creditCohortAssignments(db: Db, userId: string, courseId: string, game: LearnerGamification) {
  try {
    const role = game.role;
    if (!role) return;
    const { AssignmentService } = await import("../learning/assignment-service.js");
    const completable = await new AssignmentService(db).findCompletableForLearnerSubject(userId, "course", courseId);
    if (completable.length > 0) {
      const svc = game.service();
      for (const { assignmentId, memberId } of completable) {
        await svc.onCohortAssignmentCompleted({ userId, role, assignmentId, memberId });
      }
    }
  } catch (e) {
    logger.warn("[courses] cohort-assignment completion fan-out failed", { error: e instanceof Error ? e.message : String(e) });
  }
}

/** For every path containing this course, complete the path enrolment if done. */
async function completeContainingPaths(db: Db, userId: string, courseId: string, game: LearnerGamification) {
  try {
    const pathIds = await listPathIdsContainingCourse(db, courseId);
    const role = game.role;
    if (!role || pathIds.length === 0) return;
    const pathService = new LearningPathService(db);
    const svc = game.service();
    for (const pathId of pathIds) {
      const { newlyCompleted, enrollmentId: pathEnrollmentId } =
        await pathService.maybeCompletePathEnrollment(userId, pathId);
      if (!newlyCompleted || !pathEnrollmentId) continue;
      await svc.onLearningPathCompleted({ userId, role, pathId, enrollmentId: pathEnrollmentId });
      // #2068 GAP-8 — learning-path-completed notification.
      const pathRow = await findLearningPathTitleSlug(db, pathId);
      await NotificationService.notify({
        userId,
        type: "course",
        title: "Learning path completed",
        message: pathRow?.title ?? "You finished a learning path",
        url: pathRow?.slug ? `/learning-paths/${pathRow.slug}` : "/learn/dashboard",
        refType: "learning_path",
        refId: pathId,
      }).catch(() => undefined);
    }
  } catch (e) {
    logger.warn("[courses] path-completion fan-out failed", { error: e instanceof Error ? e.message : String(e) });
  }
}
