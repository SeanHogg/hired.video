/**
 * LearningPathService — DAG validation + unlock computation + path
 * completion detection.
 *
 * The course prerequisite graph is a DAG, not a tree: a single course
 * can have multiple prerequisites, and multiple courses can share the
 * same prerequisite. Postgres won't enforce DAG-ness, so this service is
 * the only writer that may insert into `course_prerequisites` — it
 * rejects edges that would create a cycle.
 *
 * Public surface:
 *   - addPrerequisite(courseId, prerequisiteCourseId) — cycle-safe insert
 *   - removePrerequisite(...)
 *   - listPrerequisites(courseId) — direct prereqs only
 *   - computeUnlockState(userId, courseIds) — which courses in the set
 *     the user has unlocked (all transitive prereqs passed)
 *   - isPathComplete(userId, pathId) — every required course passed
 *
 * Per the standing DRY rule (`feedback_extract_on_duplication`): every
 * unlock decision in the courses / learning-paths routes calls
 * `computeUnlockState` — there is no `canEnroll` boolean threaded
 * through the request handlers.
 */

import { and, eq, inArray, sql } from "drizzle-orm";
import type { getDb } from "../../db/index.js";
import { schema } from "../../db/index.js";

type DbHandle = ReturnType<typeof getDb>;

const {
  coursePrerequisites,
  courseEnrollments,
  learningPathCourses,
  learningPathEnrollments,
  learningPaths,
} = schema;

export type CourseId = string;

export interface UnlockState {
  /** Courses the user has personally passed. */
  passed: Set<CourseId>;
  /** Courses whose every transitive prerequisite is in `passed`. A
   *  course with no prereqs is always unlocked. */
  unlocked: Set<CourseId>;
  /** Courses still locked, mapped to the prereq ids the user is
   *  missing. Useful for UI tooltips ("Pass X and Y to unlock"). */
  locked: Map<CourseId, CourseId[]>;
}

export class LearningPathService {
  constructor(private readonly db: DbHandle) {}

  // ── Prerequisite edge management ───────────────────────────────────

  async listPrerequisites(courseId: CourseId): Promise<CourseId[]> {
    const rows = await this.db
      .select({ prerequisiteCourseId: coursePrerequisites.prerequisiteCourseId })
      .from(coursePrerequisites)
      .where(eq(coursePrerequisites.courseId, courseId));
    return rows.map((r) => r.prerequisiteCourseId);
  }

  /** Add a prerequisite edge. Throws if the edge would introduce a cycle.
   *
   *  Cycle check: a new edge (A → B, "A requires B") creates a cycle iff
   *  A is already reachable from B via existing edges (B can transitively
   *  reach A). We BFS from `prerequisiteCourseId` and reject if we ever
   *  see `courseId`. */
  async addPrerequisite(
    courseId: CourseId,
    prerequisiteCourseId: CourseId,
  ): Promise<{ created: boolean }> {
    if (courseId === prerequisiteCourseId) {
      throw new Error("Course cannot be its own prerequisite.");
    }

    await this.assertNoCycle(courseId, prerequisiteCourseId);

    const [existing] = await this.db
      .select({ id: coursePrerequisites.id })
      .from(coursePrerequisites)
      .where(and(
        eq(coursePrerequisites.courseId, courseId),
        eq(coursePrerequisites.prerequisiteCourseId, prerequisiteCourseId),
      ))
      .limit(1);
    if (existing) return { created: false };

    await this.db.insert(coursePrerequisites).values({
      courseId,
      prerequisiteCourseId,
    } as never);
    return { created: true };
  }

  async removePrerequisite(
    courseId: CourseId,
    prerequisiteCourseId: CourseId,
  ): Promise<{ removed: boolean }> {
    const deleted = await this.db
      .delete(coursePrerequisites)
      .where(and(
        eq(coursePrerequisites.courseId, courseId),
        eq(coursePrerequisites.prerequisiteCourseId, prerequisiteCourseId),
      ))
      .returning({ id: coursePrerequisites.id });
    return { removed: deleted.length > 0 };
  }

  /** Throws if adding (courseId, prerequisiteCourseId) would create a
   *  cycle. BFS from the proposed prerequisite forward through existing
   *  edges; if we ever reach `courseId`, abort.
   *
   *  N.B. an edge "A requires B" means we traverse FROM B to its
   *  dependents (courses that already require B). Those dependents' own
   *  prerequisites are irrelevant to the cycle check — we're following
   *  the dependent-of relation, which is the reverse of the prerequisite-
   *  of relation. So the BFS uses `prerequisiteCourseId = current` as
   *  the traversal predicate. */
  private async assertNoCycle(
    courseId: CourseId,
    prerequisiteCourseId: CourseId,
  ): Promise<void> {
    if (courseId === prerequisiteCourseId) {
      throw new Error("Course cannot be its own prerequisite.");
    }
    const visited = new Set<CourseId>([prerequisiteCourseId]);
    let frontier: CourseId[] = [prerequisiteCourseId];
    while (frontier.length > 0) {
      const next = await this.db
        .select({
          courseId: coursePrerequisites.courseId,
        })
        .from(coursePrerequisites)
        .where(inArray(coursePrerequisites.prerequisiteCourseId, frontier));
      const newCourses: CourseId[] = [];
      for (const row of next) {
        if (row.courseId === courseId) {
          throw new Error(
            `Cycle: adding course ${courseId} → prereq ${prerequisiteCourseId} would create a cycle.`,
          );
        }
        if (!visited.has(row.courseId)) {
          visited.add(row.courseId);
          newCourses.push(row.courseId);
        }
      }
      frontier = newCourses;
    }
  }

  // ── Unlock computation ─────────────────────────────────────────────

  /** For a given user + set of courses, compute which are unlocked.
   *  Expands the prerequisite closure for the candidate set, then
   *  intersects with the user's passed-courses set. */
  async computeUnlockState(
    userId: string,
    courseIds: CourseId[],
  ): Promise<UnlockState> {
    if (courseIds.length === 0) {
      return { passed: new Set(), unlocked: new Set(), locked: new Map() };
    }

    // Closure of prerequisites — keep expanding until no new courses.
    const allRelated = new Set<CourseId>(courseIds);
    let frontier: CourseId[] = [...courseIds];
    while (frontier.length > 0) {
      const rows = await this.db
        .select({
          courseId: coursePrerequisites.courseId,
          prerequisiteCourseId: coursePrerequisites.prerequisiteCourseId,
        })
        .from(coursePrerequisites)
        .where(inArray(coursePrerequisites.courseId, frontier));
      const next: CourseId[] = [];
      for (const r of rows) {
        if (!allRelated.has(r.prerequisiteCourseId)) {
          allRelated.add(r.prerequisiteCourseId);
          next.push(r.prerequisiteCourseId);
        }
      }
      frontier = next;
    }

    // Direct prereq edges within the closure (for the locked-reason map).
    const directEdgeRows = await this.db
      .select({
        courseId: coursePrerequisites.courseId,
        prerequisiteCourseId: coursePrerequisites.prerequisiteCourseId,
      })
      .from(coursePrerequisites)
      .where(inArray(coursePrerequisites.courseId, [...allRelated]));
    const directEdges = new Map<CourseId, CourseId[]>();
    for (const r of directEdgeRows) {
      const list = directEdges.get(r.courseId) ?? [];
      list.push(r.prerequisiteCourseId);
      directEdges.set(r.courseId, list);
    }

    // User's passed courses across the closure.
    const passedRows = await this.db
      .select({ courseId: courseEnrollments.courseId })
      .from(courseEnrollments)
      .where(and(
        eq(courseEnrollments.userId, userId),
        eq(courseEnrollments.passed, true),
        inArray(courseEnrollments.courseId, [...allRelated]),
      ));
    const passed = new Set<CourseId>(passedRows.map((r) => r.courseId));

    // A course is unlocked iff every direct prereq is in `passed`
    // (transitively-covered because we walk every course's direct
    // prereqs and recursively-passed courses had their prereqs satisfied
    // before they themselves could have been passed). A course with no
    // direct prereqs is unlocked.
    const unlocked = new Set<CourseId>();
    const locked = new Map<CourseId, CourseId[]>();
    for (const id of courseIds) {
      const directs = directEdges.get(id) ?? [];
      const missing = directs.filter((p) => !passed.has(p));
      if (missing.length === 0) {
        unlocked.add(id);
      } else {
        locked.set(id, missing);
      }
    }
    return { passed, unlocked, locked };
  }

  /** Check whether the user has passed every required course in a path.
   *  Returns the boolean + the missing courses for display. */
  async isPathComplete(
    userId: string,
    pathId: string,
  ): Promise<{ complete: boolean; missing: CourseId[] }> {
    const required = await this.db
      .select({ courseId: learningPathCourses.courseId })
      .from(learningPathCourses)
      .where(and(
        eq(learningPathCourses.pathId, pathId),
        eq(learningPathCourses.isRequired, true),
      ));
    if (required.length === 0) {
      return { complete: false, missing: [] };
    }
    const requiredIds = required.map((r) => r.courseId);
    const passedRows = await this.db
      .select({ courseId: courseEnrollments.courseId })
      .from(courseEnrollments)
      .where(and(
        eq(courseEnrollments.userId, userId),
        eq(courseEnrollments.passed, true),
        inArray(courseEnrollments.courseId, requiredIds),
      ));
    const passed = new Set(passedRows.map((r) => r.courseId));
    const missing = requiredIds.filter((id) => !passed.has(id));
    return { complete: missing.length === 0, missing };
  }

  /** Mark a learning-path enrollment as completed if every required
   *  course is now passed. Idempotent — returns the enrollment row and
   *  whether THIS call flipped it to completed (for award fan-out). */
  async maybeCompletePathEnrollment(
    userId: string,
    pathId: string,
  ): Promise<{ enrollmentId: string | null; newlyCompleted: boolean }> {
    const [enrollment] = await this.db
      .select()
      .from(learningPathEnrollments)
      .where(and(
        eq(learningPathEnrollments.userId, userId),
        eq(learningPathEnrollments.pathId, pathId),
      ))
      .limit(1);
    if (!enrollment) return { enrollmentId: null, newlyCompleted: false };
    if (enrollment.completedAt) return { enrollmentId: enrollment.id, newlyCompleted: false };

    const { complete } = await this.isPathComplete(userId, pathId);
    if (!complete) return { enrollmentId: enrollment.id, newlyCompleted: false };

    await this.db
      .update(learningPathEnrollments)
      .set({ completedAt: new Date(), updatedAt: new Date() } as never)
      .where(eq(learningPathEnrollments.id, enrollment.id));
    await this.db
      .update(learningPaths)
      .set({ completionCount: sql`${learningPaths.completionCount} + 1` } as never)
      .where(eq(learningPaths.id, pathId))
      .catch(() => undefined);
    return { enrollmentId: enrollment.id, newlyCompleted: true };
  }
}
