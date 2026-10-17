/**
 * Course row persistence for /api/courses (owner CRUD, publish lifecycle,
 * review queue, aggregates). Module/lesson rows live in
 * courseContentRepository; enrolments in courseEnrollmentsRepository; the
 * public author-joined reads in coursePublicRepository.
 */
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { schema, type Db } from "../db/index.js";

const { courses, courseLessons } = schema;

export type CourseRow = typeof courses.$inferSelect;
export type CourseInsert = typeof courses.$inferInsert;

export async function courseOwnedBy(db: Db, userId: string, courseId: string): Promise<boolean> {
  const [row] = await db.select({ id: courses.id })
    .from(courses)
    .where(and(eq(courses.id, courseId), eq(courses.userId, userId)))
    .limit(1);
  return row != null;
}

export async function courseExists(db: Db, courseId: string): Promise<boolean> {
  const [row] = await db.select({ id: courses.id })
    .from(courses)
    .where(eq(courses.id, courseId))
    .limit(1);
  return row != null;
}

export async function findCourseById(db: Db, courseId: string): Promise<CourseRow | null> {
  const [row] = await db.select().from(courses).where(eq(courses.id, courseId)).limit(1);
  return row ?? null;
}

/** Course by id, restricted to `ownerId` unless `ownerId` is null (SuperAdmin). */
export async function findCourseScoped(
  db: Db,
  courseId: string,
  ownerId: string | null,
): Promise<CourseRow | null> {
  const where = ownerId == null
    ? eq(courses.id, courseId)
    : and(eq(courses.id, courseId), eq(courses.userId, ownerId));
  const [row] = await db.select().from(courses).where(where).limit(1);
  return row ?? null;
}

export async function findPublishedCourseById(db: Db, courseId: string): Promise<CourseRow | null> {
  const [row] = await db.select().from(courses)
    .where(and(eq(courses.id, courseId), eq(courses.status, "published")))
    .limit(1);
  return row ?? null;
}

export async function listCoursesByOwner(db: Db, userId: string): Promise<CourseRow[]> {
  return db.select().from(courses)
    .where(eq(courses.userId, userId))
    .orderBy(desc(courses.updatedAt));
}

/** In-review queue; `reviewerId` null = the whole queue (SuperAdmin). */
export async function listCoursesInReview(db: Db, reviewerId: string | null): Promise<CourseRow[]> {
  const where = reviewerId == null
    ? eq(courses.status, "in_review")
    : and(eq(courses.status, "in_review"), eq(courses.assignedReviewerId, reviewerId));
  return db.select().from(courses).where(where).orderBy(desc(courses.updatedAt));
}

export async function courseSlugTaken(db: Db, userId: string, slug: string): Promise<boolean> {
  const [row] = await db.select({ id: courses.id })
    .from(courses)
    .where(and(eq(courses.userId, userId), eq(courses.slug, slug)))
    .limit(1);
  return row != null;
}

export async function insertCourse(db: Db, values: Record<string, unknown>): Promise<CourseRow | undefined> {
  const [created] = await db.insert(courses).values(values as CourseInsert).returning();
  return created;
}

export async function updateCourseById(
  db: Db,
  courseId: string,
  patch: Record<string, unknown>,
): Promise<CourseRow | undefined> {
  const [updated] = await db.update(courses).set(patch as Partial<CourseInsert>)
    .where(eq(courses.id, courseId))
    .returning();
  return updated;
}

export async function deleteCourseById(db: Db, courseId: string): Promise<string | null> {
  const [deleted] = await db.delete(courses)
    .where(eq(courses.id, courseId))
    .returning({ id: courses.id });
  return deleted?.id ?? null;
}

export async function countCourseLessons(db: Db, courseId: string): Promise<number> {
  const rows = await db.select({ n: sql<number>`count(*)::int` }).from(courseLessons)
    .where(eq(courseLessons.courseId, courseId));
  return rows[0]?.n ?? 0;
}

/** Best-effort aggregate bump; failures are swallowed. */
export async function incrementEnrollmentCount(db: Db, courseId: string): Promise<void> {
  await db.update(courses)
    .set({ enrollmentCount: sql`${courses.enrollmentCount} + 1` })
    .where(eq(courses.id, courseId))
    .catch(() => undefined);
}

/** Best-effort aggregate decrement, clamped at 0. */
export async function decrementEnrollmentCount(db: Db, courseId: string): Promise<void> {
  await db.update(courses)
    .set({ enrollmentCount: sql`GREATEST(${courses.enrollmentCount} - 1, 0)` })
    .where(eq(courses.id, courseId))
    .catch(() => undefined);
}

/** Best-effort completion aggregate bump. */
export async function incrementCompletionCount(db: Db, courseId: string): Promise<void> {
  await db.update(courses)
    .set({ completionCount: sql`${courses.completionCount} + 1` })
    .where(eq(courses.id, courseId))
    .catch(() => undefined);
}

/** The course fields the progress/completion pipeline needs. */
export async function findCourseCompletionMeta(db: Db, courseId: string) {
  const [row] = await db.select({
    title: courses.title,
    slug: courses.slug,
    passingScorePct: courses.passingScorePct,
    issuesCertificate: courses.issuesCertificate,
  })
    .from(courses)
    .where(eq(courses.id, courseId))
    .limit(1);
  return row ?? null;
}

/** Summary cards for a set of course ids (prerequisite listing). */
export async function listCourseSummariesByIds(db: Db, courseIds: string[]) {
  return db.select({
    id: courses.id,
    title: courses.title,
    slug: courses.slug,
    coverImageUrl: courses.coverImageUrl,
  })
    .from(courses)
    .where(inArray(courses.id, courseIds));
}
