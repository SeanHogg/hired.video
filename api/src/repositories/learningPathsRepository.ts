/**
 * Learning paths (mig 0126) — curated multi-course journeys, their course
 * slots and learner enrollments. Owner reads/writes are scoped by `userId`;
 * public reads only ever return `status = 'published'` rows.
 */
import { and, desc, eq, sql } from "drizzle-orm";
import { schema, type Db } from "../db/index.js";
import type { LearningPath } from "../db/schema/learning.js";

const { courses, learningPaths, learningPathCourses, learningPathEnrollments } = schema;

// ── Paths ────────────────────────────────────────────────────────────────────

export async function listPublishedPaths(db: Db, limit: number): Promise<LearningPath[]> {
  return db
    .select()
    .from(learningPaths)
    .where(eq(learningPaths.status, "published"))
    .orderBy(desc(learningPaths.publishedAt))
    .limit(limit);
}

export async function findPublishedPath(db: Db, id: string): Promise<LearningPath | null> {
  const [row] = await db.select().from(learningPaths)
    .where(and(eq(learningPaths.id, id), eq(learningPaths.status, "published")))
    .limit(1);
  return row ?? null;
}

export async function findOwnedPath(db: Db, userId: string, id: string): Promise<LearningPath | null> {
  const [row] = await db.select().from(learningPaths)
    .where(and(eq(learningPaths.id, id), eq(learningPaths.userId, userId)))
    .limit(1);
  return row ?? null;
}

export async function listPathsByOwner(db: Db, userId: string): Promise<LearningPath[]> {
  return db.select().from(learningPaths)
    .where(eq(learningPaths.userId, userId))
    .orderBy(desc(learningPaths.updatedAt));
}

export async function ownerSlugExists(db: Db, userId: string, slug: string): Promise<boolean> {
  const [row] = await db.select({ id: learningPaths.id })
    .from(learningPaths)
    .where(and(eq(learningPaths.userId, userId), eq(learningPaths.slug, slug)))
    .limit(1);
  return Boolean(row);
}

export async function insertPath(db: Db, values: Record<string, unknown>): Promise<LearningPath> {
  const [row] = await db.insert(learningPaths).values(values as never).returning();
  return row as LearningPath;
}

export async function updateOwnedPath(
  db: Db,
  userId: string,
  id: string,
  patch: Record<string, unknown>,
): Promise<LearningPath | null> {
  const [row] = await db.update(learningPaths).set(patch as never)
    .where(and(eq(learningPaths.id, id), eq(learningPaths.userId, userId)))
    .returning();
  return row ?? null;
}

export async function deleteOwnedPath(db: Db, userId: string, id: string): Promise<string | null> {
  const [row] = await db.delete(learningPaths)
    .where(and(eq(learningPaths.id, id), eq(learningPaths.userId, userId)))
    .returning({ id: learningPaths.id });
  return row?.id ?? null;
}

export async function bumpPathEnrollmentCount(db: Db, pathId: string): Promise<void> {
  await db.update(learningPaths)
    .set({ enrollmentCount: sql`${learningPaths.enrollmentCount} + 1` } as never)
    .where(eq(learningPaths.id, pathId));
}

// ── Slots (path → courses) ───────────────────────────────────────────────────

/** Slots joined to their full course rows, in display order. */
export async function listSlotsWithCourses(db: Db, pathId: string) {
  return db.select({ slot: learningPathCourses, course: courses })
    .from(learningPathCourses)
    .innerJoin(courses, eq(courses.id, learningPathCourses.courseId))
    .where(eq(learningPathCourses.pathId, pathId))
    .orderBy(learningPathCourses.displayOrder);
}

export async function listSlotCourseIds(db: Db, pathId: string): Promise<string[]> {
  const rows = await db.select({ courseId: learningPathCourses.courseId })
    .from(learningPathCourses)
    .where(eq(learningPathCourses.pathId, pathId));
  return rows.map((r) => r.courseId);
}

export async function countSlots(db: Db, pathId: string): Promise<number> {
  const [row] = await db.select({ n: sql<number>`count(*)::int` })
    .from(learningPathCourses)
    .where(eq(learningPathCourses.pathId, pathId));
  return row?.n ?? 0;
}

/** Insert one slot; null when the course is already attached. */
export async function insertSlot(
  db: Db,
  values: { pathId: string; courseId: string; displayOrder: number; isRequired: boolean },
) {
  const [row] = await db.insert(learningPathCourses).values(values as never).onConflictDoNothing().returning();
  return row ?? null;
}

export async function insertSlots(
  db: Db,
  values: Array<{ pathId: string; courseId: string; displayOrder: number; isRequired: boolean }>,
): Promise<void> {
  if (values.length === 0) return;
  await db.insert(learningPathCourses).values(values as never);
}

export async function updateSlot(
  db: Db,
  pathId: string,
  courseId: string,
  patch: { displayOrder?: number; isRequired?: boolean },
) {
  const [row] = await db.update(learningPathCourses).set(patch as never)
    .where(and(eq(learningPathCourses.pathId, pathId), eq(learningPathCourses.courseId, courseId)))
    .returning();
  return row ?? null;
}

export async function deleteSlot(db: Db, pathId: string, courseId: string): Promise<string | null> {
  const [row] = await db.delete(learningPathCourses)
    .where(and(eq(learningPathCourses.pathId, pathId), eq(learningPathCourses.courseId, courseId)))
    .returning({ id: learningPathCourses.id });
  return row?.id ?? null;
}

// ── Enrollments ──────────────────────────────────────────────────────────────

export async function listEnrollmentsWithPaths(db: Db, userId: string) {
  return db
    .select({ enrollment: learningPathEnrollments, path: learningPaths })
    .from(learningPathEnrollments)
    .innerJoin(learningPaths, eq(learningPaths.id, learningPathEnrollments.pathId))
    .where(eq(learningPathEnrollments.userId, userId))
    .orderBy(desc(learningPathEnrollments.enrolledAt));
}

export async function findEnrollment(db: Db, userId: string, pathId: string) {
  const [row] = await db.select().from(learningPathEnrollments)
    .where(and(eq(learningPathEnrollments.userId, userId), eq(learningPathEnrollments.pathId, pathId)))
    .limit(1);
  return row ?? null;
}

export async function insertEnrollment(db: Db, userId: string, pathId: string) {
  const [row] = await db.insert(learningPathEnrollments).values({ pathId, userId } as never).returning();
  return row;
}
