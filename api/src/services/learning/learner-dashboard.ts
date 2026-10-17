/**
 * Learner dashboard read-model (#2068 GAP-5).
 *
 * Consolidates the learner's enrollment + certificate read models into a
 * single server-side aggregate so the dashboard renders from ONE round-trip
 * instead of fanning out to /me/enrollments + /me/certificates + points.
 * Gamification (points/streak/badges) is merged in by the route via the
 * existing GamificationService.getUserSummary; assignments via
 * AssignmentService.listForLearner — both already cached/efficient.
 *
 * Pure DB aggregation (no request context) so it can be unit-tested and
 * wrapped in the read-through cache by the caller.
 */

import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { schema, type getDb } from "../../db/index.js";
import { invalidateIsolateKey } from "../../utils/isolate-cache.js";

type Db = ReturnType<typeof getDb>;
const { courseEnrollments, courses, courseLessons, courseCertificates } = schema;

export interface LearnerCourseRow {
  enrollmentId: string;
  courseId: string;
  title: string;
  slug: string;
  coverImageUrl: string | null;
  pct: number;
  passed: boolean;
}

export interface LearnerCertificateRow {
  id: string;
  certNumber: string;
  courseTitle: string | null;
  courseSlug: string | null;
  issuedAt: string;
}

export interface LearnerDashboardData {
  stats: { activeCourses: number; completedCourses: number; certificates: number };
  continueLearning: LearnerCourseRow[];
  completed: LearnerCourseRow[];
  certificates: LearnerCertificateRow[];
}

const SECTION_LIMIT = 8;

/** Read-through cache key for the dashboard aggregate (services/learning/learning-surface.ts). */
export const learnerDashboardCacheKey = (userId: string): string => `learn:dash:${userId}`;

/** Bust the learner's cached dashboard. Call from every write to the
 *  learner's own enrollments / lesson progress / certificates. */
export function invalidateLearnerDashboard(userId: string): void {
  invalidateIsolateKey(learnerDashboardCacheKey(userId));
}

export async function getLearnerDashboard(db: Db, userId: string): Promise<LearnerDashboardData> {
  const rows = await db
    .select({ enrollment: courseEnrollments, course: courses })
    .from(courseEnrollments)
    .innerJoin(courses, eq(courseEnrollments.courseId, courses.id))
    .where(eq(courseEnrollments.userId, userId))
    .orderBy(desc(courseEnrollments.enrolledAt));

  // Batch lesson totals per course so progress % is O(1) over enrollments.
  const courseIds = Array.from(new Set(rows.map((r) => r.course.id)));
  let totalsByCourse = new Map<string, number>();
  if (courseIds.length > 0) {
    const counts = await db
      .select({ courseId: courseLessons.courseId, n: sql<number>`count(*)::int` })
      .from(courseLessons)
      .where(inArray(courseLessons.courseId, courseIds))
      .groupBy(courseLessons.courseId);
    totalsByCourse = new Map(counts.map((c) => [c.courseId, Number(c.n) || 0]));
  }

  const mapped: Array<LearnerCourseRow & { passedAt: number }> = rows.map((r) => {
    const total = totalsByCourse.get(r.course.id) ?? 0;
    const progress = (r.enrollment.progress ?? {}) as Record<string, { status?: string }>;
    const passedLessons = Object.values(progress).filter((p) => p?.status === "passed").length;
    const pct = total > 0 ? Math.min(100, Math.round((passedLessons / total) * 100)) : (r.enrollment.passed ? 100 : 0);
    return {
      enrollmentId: r.enrollment.id,
      courseId: r.course.id,
      title: r.course.title,
      slug: r.course.slug,
      coverImageUrl: r.course.coverImageUrl,
      pct,
      passed: r.enrollment.passed,
      passedAt: r.enrollment.completedAt ? new Date(r.enrollment.completedAt).getTime() : 0,
    };
  });

  const completedRows = mapped.filter((m) => m.passed);
  const inProgress = mapped.filter((m) => !m.passed);

  const certRows = await db
    .select({
      id: courseCertificates.id,
      certNumber: courseCertificates.certNumber,
      issuedAt: courseCertificates.issuedAt,
      courseTitle: courses.title,
      courseSlug: courses.slug,
    })
    .from(courseCertificates)
    .leftJoin(courses, eq(courseCertificates.courseId, courses.id))
    .where(eq(courseCertificates.userId, userId))
    .orderBy(desc(courseCertificates.issuedAt))
    .limit(SECTION_LIMIT);

  const strip = ({ passedAt: _passedAt, ...rest }: LearnerCourseRow & { passedAt: number }) => rest;

  return {
    stats: {
      activeCourses: inProgress.length,
      completedCourses: completedRows.length,
      certificates: certRows.length,
    },
    continueLearning: inProgress.slice(0, SECTION_LIMIT).map(strip),
    completed: completedRows
      .sort((a, b) => b.passedAt - a.passedAt)
      .slice(0, SECTION_LIMIT)
      .map(strip),
    certificates: certRows.map((r) => ({
      id: r.id,
      certNumber: r.certNumber,
      courseTitle: r.courseTitle ?? null,
      courseSlug: r.courseSlug ?? null,
      issuedAt: new Date(r.issuedAt).toISOString(),
    })),
  };
}
