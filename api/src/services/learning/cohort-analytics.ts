/**
 * Cohort analytics roll-up (#1890) — the educator/employer answer to
 * "how is my class doing?".
 *
 * This is i-Ready's core teacher value prop: per-member progress across
 * every assignment, with overdue flags + a cohort summary. It's an
 * expensive fan-out (members × assignments × enrollments), so it is served
 * through the isolate read-through cache (getOrSetIsolateCached — per-cohort
 * keys, zero KV writes) and recomputed
 * with FULLY BATCHED queries — O(1) round-trips regardless of cohort size.
 *
 * Cache strategy: structural changes (member add/remove, assignment
 * create/delete, cohort archive) call `invalidateCohortAnalyticsCache`
 * for instant refresh. STUDENT progress is written in courses.ts (SCORM
 * commit / lesson progress) which has no cohort handle, so we also keep a
 * short TTL (45s) so live progress surfaces within a minute without a
 * reverse cohort lookup on every learner write. (Wiring that reverse
 * invalidation is tracked as a residual gap.)
 */

import { and, eq, inArray, sql } from "drizzle-orm";
import type { getDb } from "../../db/index.js";
import { schema } from "../../db/index.js";
import { getOrSetIsolateCached, invalidateIsolateKey } from "../../utils/isolate-cache.js";
import type { LessonProgress } from "../../db/schema/courses.js";

type DbHandle = ReturnType<typeof getDb>;

const {
  cohortMembers,
  learningAssignments,
  courses,
  courseLessons,
  courseEnrollments,
  learningPaths,
  learningPathCourses,
  learningPathEnrollments,
  users,
} = schema;

const ANALYTICS_TTL_SECONDS = 45;
const cacheKey = (cohortId: string) => `cohort-analytics:${cohortId}`;

/** Drop the cached roll-up for a cohort. Called by every structural
 *  mutation in CohortService / AssignmentService. */
export function invalidateCohortAnalyticsCache(cohortId: string): void {
  invalidateIsolateKey(cacheKey(cohortId));
}

export type LearnerItemStatus = "not_started" | "in_progress" | "completed" | "not_linked";

export interface AssignmentProgressCell {
  assignmentId: string;
  subjectType: "course" | "path";
  subjectId: string;
  title: string;
  required: boolean;
  dueAt: string | null;
  status: LearnerItemStatus;
  scorePct: number | null;
  /** 0–1 fraction of lessons (course) / required courses (path) done. */
  fraction: number;
  completedAt: string | null;
  overdue: boolean;
}

export interface MemberRow {
  memberId: string;
  userId: string | null;
  name: string | null;
  email: string | null;
  role: string;
  status: string;
  linked: boolean;
  items: AssignmentProgressCell[];
  completedCount: number;
  totalCount: number;
  overdueCount: number;
}

/** Canonical gradebook column — the union of every active assignment in the
 *  cohort, so the grid header is stable regardless of which member is first
 *  and member-specific assignments still get a column (#2068 GAP-6). */
export interface GradebookColumn {
  assignmentId: string;
  title: string;
  subjectType: "course" | "path";
  required: boolean;
  memberSpecific: boolean;
}

export interface CohortAnalytics {
  cohortId: string;
  generatedAt: string;
  memberCount: number;
  assignmentCount: number;
  /** Full ordered column set for the gradebook grid. */
  assignments: GradebookColumn[];
  summary: {
    completed: number;
    inProgress: number;
    notStarted: number;
    overdue: number;
    completionRate: number; // 0–1 over required assignment-cells
  };
  members: MemberRow[];
}

export class CohortAnalyticsService {
  constructor(private readonly db: DbHandle) {}

  /** Cached roll-up. The caller has already verified the actor may manage
   *  this cohort. */
  getAnalytics(cohortId: string): Promise<CohortAnalytics> {
    return getOrSetIsolateCached<CohortAnalytics>({
      key: cacheKey(cohortId),
      ttlSeconds: ANALYTICS_TTL_SECONDS,
      loader: () => this.compute(cohortId),
    });
  }

  private async compute(cohortId: string): Promise<CohortAnalytics> {
    const now = new Date();

    // 1. Members (active/invited) + their identity.
    const memberRows = await this.db
      .select({ member: cohortMembers, name: users.name, email: users.email })
      .from(cohortMembers)
      .leftJoin(users, eq(users.id, cohortMembers.userId))
      .where(and(eq(cohortMembers.cohortId, cohortId), sql`${cohortMembers.status} <> 'removed'`));

    // 2. Active assignments (cohort-wide + member-specific).
    const assignments = await this.db
      .select()
      .from(learningAssignments)
      .where(and(eq(learningAssignments.cohortId, cohortId), eq(learningAssignments.status, "active")));

    const courseIds = [...new Set(assignments.filter((a) => a.subjectType === "course").map((a) => a.subjectId))];
    const pathIds = [...new Set(assignments.filter((a) => a.subjectType === "path").map((a) => a.subjectId))];
    const memberUserIds = [...new Set(memberRows.map((m) => m.member.userId).filter((id): id is string => Boolean(id)))];

    // 3. Titles (batched).
    const [courseTitleRows, pathTitleRows] = await Promise.all([
      courseIds.length
        ? this.db.select({ id: courses.id, title: courses.title }).from(courses).where(inArray(courses.id, courseIds))
        : Promise.resolve([] as { id: string; title: string }[]),
      pathIds.length
        ? this.db.select({ id: learningPaths.id, title: learningPaths.title }).from(learningPaths).where(inArray(learningPaths.id, pathIds))
        : Promise.resolve([] as { id: string; title: string }[]),
    ]);
    const titleById = new Map<string, string>();
    for (const r of courseTitleRows) titleById.set(r.id, r.title);
    for (const r of pathTitleRows) titleById.set(r.id, r.title);

    // 4. Lesson counts per course (batched) — denominator for course %.
    const lessonCountByCourse = new Map<string, number>();
    if (courseIds.length) {
      const counts = await this.db
        .select({ courseId: courseLessons.courseId, n: sql<number>`count(*)::int` })
        .from(courseLessons)
        .where(inArray(courseLessons.courseId, courseIds))
        .groupBy(courseLessons.courseId);
      for (const r of counts) lessonCountByCourse.set(r.courseId, Number(r.n) || 0);
    }

    // 5. Required courses per path (batched) — denominator for path %.
    const requiredByPath = new Map<string, string[]>();
    const allPathRequiredCourseIds = new Set<string>();
    if (pathIds.length) {
      const rows = await this.db
        .select({ pathId: learningPathCourses.pathId, courseId: learningPathCourses.courseId })
        .from(learningPathCourses)
        .where(and(inArray(learningPathCourses.pathId, pathIds), eq(learningPathCourses.isRequired, true)));
      for (const r of rows) {
        const list = requiredByPath.get(r.pathId) ?? [];
        list.push(r.courseId);
        requiredByPath.set(r.pathId, list);
        allPathRequiredCourseIds.add(r.courseId);
      }
    }

    // 6. Course enrollments for these members (batched) → (user|course).
    const courseEnrollKey = (u: string, c: string) => `${u}::${c}`;
    const enrollByUserCourse = new Map<string, { passed: boolean; finalScorePct: number | null; started: boolean; passedLessons: number; completedAt: Date | null }>();
    const allLookupCourseIds = [...new Set([...courseIds, ...allPathRequiredCourseIds])];
    if (memberUserIds.length && allLookupCourseIds.length) {
      const rows = await this.db
        .select()
        .from(courseEnrollments)
        .where(and(inArray(courseEnrollments.userId, memberUserIds), inArray(courseEnrollments.courseId, allLookupCourseIds)));
      for (const e of rows) {
        const progress = (e.progress ?? {}) as Record<string, LessonProgress>;
        const passedLessons = Object.values(progress).filter((p) => p?.status === "passed").length;
        const started = Boolean(e.startedAt) || passedLessons > 0;
        enrollByUserCourse.set(courseEnrollKey(e.userId, e.courseId), {
          passed: e.passed,
          finalScorePct: e.finalScorePct,
          started,
          passedLessons,
          completedAt: e.completedAt,
        });
      }
    }

    // 7. Path enrollments for these members (batched).
    const pathEnrollKey = (u: string, p: string) => `${u}::${p}`;
    const pathEnrollByUser = new Map<string, { completedAt: Date | null; started: boolean }>();
    if (memberUserIds.length && pathIds.length) {
      const rows = await this.db
        .select()
        .from(learningPathEnrollments)
        .where(and(inArray(learningPathEnrollments.userId, memberUserIds), inArray(learningPathEnrollments.pathId, pathIds)));
      for (const e of rows) {
        pathEnrollByUser.set(pathEnrollKey(e.userId, e.pathId), { completedAt: e.completedAt, started: Boolean(e.startedAt) });
      }
    }

    // 8. Build per-member cells.
    let sumCompleted = 0;
    let sumInProgress = 0;
    let sumNotStarted = 0;
    let sumOverdue = 0;
    let requiredCells = 0;
    let requiredCompleted = 0;

    const members: MemberRow[] = memberRows.map((m) => {
      const userId = m.member.userId;
      const linked = Boolean(userId);
      const applicable = assignments.filter((a) => a.memberId === null || a.memberId === m.member.id);

      const items: AssignmentProgressCell[] = applicable.map((a) => {
        let status: LearnerItemStatus = "not_started";
        let fraction = 0;
        let scorePct: number | null = null;
        let completedAt: Date | null = null;

        if (!linked) {
          status = "not_linked";
        } else if (a.subjectType === "course") {
          const e = enrollByUserCourse.get(courseEnrollKey(userId!, a.subjectId));
          const total = lessonCountByCourse.get(a.subjectId) ?? 0;
          if (e?.passed) {
            status = "completed";
            fraction = 1;
            scorePct = e.finalScorePct;
            completedAt = e.completedAt;
          } else if (e?.started) {
            status = "in_progress";
            fraction = total > 0 ? Math.min(1, e.passedLessons / total) : 0;
          }
        } else {
          // path
          const pe = pathEnrollByUser.get(pathEnrollKey(userId!, a.subjectId));
          const required = requiredByPath.get(a.subjectId) ?? [];
          const passedReq = required.filter((cid) => enrollByUserCourse.get(courseEnrollKey(userId!, cid))?.passed).length;
          if (pe?.completedAt || (required.length > 0 && passedReq === required.length)) {
            status = "completed";
            fraction = 1;
            completedAt = pe?.completedAt ?? null;
          } else if (pe?.started || passedReq > 0) {
            status = "in_progress";
            fraction = required.length > 0 ? passedReq / required.length : 0;
          }
        }

        const overdue = Boolean(a.dueAt) && status !== "completed" && status !== "not_linked" && now > a.dueAt!;
        if (a.required && linked) {
          requiredCells++;
          if (status === "completed") requiredCompleted++;
        }
        if (linked) {
          if (status === "completed") sumCompleted++;
          else if (status === "in_progress") sumInProgress++;
          else sumNotStarted++;
          if (overdue) sumOverdue++;
        }

        return {
          assignmentId: a.id,
          subjectType: a.subjectType as "course" | "path",
          subjectId: a.subjectId,
          title: titleById.get(a.subjectId) ?? "Untitled",
          required: a.required,
          dueAt: a.dueAt ? a.dueAt.toISOString() : null,
          status,
          scorePct: scorePct ?? null,
          fraction,
          completedAt: completedAt ? completedAt.toISOString() : null,
          overdue,
        };
      });

      return {
        memberId: m.member.id,
        userId,
        name: m.name ?? m.member.displayName ?? null,
        email: m.email ?? m.member.invitedEmail ?? null,
        role: m.member.role,
        status: m.member.status,
        linked,
        items,
        completedCount: items.filter((i) => i.status === "completed").length,
        totalCount: items.length,
        overdueCount: items.filter((i) => i.overdue).length,
      };
    });

    // Canonical column set — every active assignment, ordered as fetched.
    const columns: GradebookColumn[] = assignments.map((a) => ({
      assignmentId: a.id,
      title: titleById.get(a.subjectId) ?? "Untitled",
      subjectType: a.subjectType as "course" | "path",
      required: a.required,
      memberSpecific: a.memberId !== null,
    }));

    return {
      cohortId,
      generatedAt: now.toISOString(),
      memberCount: members.length,
      assignmentCount: assignments.length,
      assignments: columns,
      summary: {
        completed: sumCompleted,
        inProgress: sumInProgress,
        notStarted: sumNotStarted,
        overdue: sumOverdue,
        completionRate: requiredCells > 0 ? requiredCompleted / requiredCells : 0,
      },
      members,
    };
  }
}
