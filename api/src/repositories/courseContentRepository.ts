/**
 * Course module + lesson persistence for /api/courses (authoring tree,
 * learner content fetch, completion inputs, SCORM lesson checks).
 */
import { and, eq, inArray, sql } from "drizzle-orm";
import { schema, type Db } from "../db/index.js";

const { courses, courseModules, courseLessons, studioProjects } = schema;

export type CourseModuleRow = typeof courseModules.$inferSelect;
export type CourseLessonRow = typeof courseLessons.$inferSelect;

export async function listCourseModules(db: Db, courseId: string): Promise<CourseModuleRow[]> {
  return db.select().from(courseModules)
    .where(eq(courseModules.courseId, courseId))
    .orderBy(courseModules.sortOrder);
}

export async function listCourseLessons(db: Db, courseId: string): Promise<CourseLessonRow[]> {
  return db.select().from(courseLessons)
    .where(eq(courseLessons.courseId, courseId))
    .orderBy(courseLessons.sortOrder);
}

// ---------------------------------------------------------------------------
// Modules
// ---------------------------------------------------------------------------

export async function insertModule(db: Db, values: Record<string, unknown>): Promise<CourseModuleRow | undefined> {
  const [created] = await db.insert(courseModules)
    .values(values as typeof courseModules.$inferInsert)
    .returning();
  return created;
}

export async function findModuleCourseId(db: Db, moduleId: string): Promise<string | null> {
  const [row] = await db
    .select({ courseId: courseModules.courseId })
    .from(courseModules)
    .where(eq(courseModules.id, moduleId))
    .limit(1);
  return row?.courseId ?? null;
}

export async function updateModuleById(
  db: Db,
  moduleId: string,
  patch: Record<string, unknown>,
): Promise<CourseModuleRow | undefined> {
  const [updated] = await db.update(courseModules)
    .set(patch as Partial<typeof courseModules.$inferInsert>)
    .where(eq(courseModules.id, moduleId))
    .returning();
  return updated;
}

export async function deleteModuleById(db: Db, moduleId: string): Promise<void> {
  await db.delete(courseModules).where(eq(courseModules.id, moduleId));
}

// ---------------------------------------------------------------------------
// Lessons
// ---------------------------------------------------------------------------

export async function insertLesson(db: Db, values: Record<string, unknown>): Promise<CourseLessonRow | undefined> {
  const [created] = await db.insert(courseLessons)
    .values(values as typeof courseLessons.$inferInsert)
    .returning();
  return created;
}

export async function findLessonCourseId(db: Db, lessonId: string): Promise<string | null> {
  const [row] = await db
    .select({ courseId: courseLessons.courseId })
    .from(courseLessons)
    .where(eq(courseLessons.id, lessonId))
    .limit(1);
  return row?.courseId ?? null;
}

export async function updateLessonById(
  db: Db,
  lessonId: string,
  patch: Record<string, unknown>,
): Promise<CourseLessonRow | undefined> {
  const [updated] = await db.update(courseLessons)
    .set(patch as Partial<typeof courseLessons.$inferInsert>)
    .where(eq(courseLessons.id, lessonId))
    .returning();
  return updated;
}

/** Lesson + owning course's author — what the delete path needs to clean
 *  the SCORM package's R2 prefix (keyed on the course owner, #1440). */
export async function findLessonForDelete(db: Db, lessonId: string) {
  const [row] = await db
    .select({
      ownerId: courses.userId,
      courseId: courseLessons.courseId,
      sourceType: courseLessons.sourceType,
      scormPkgId: courseLessons.scormPkgId,
    })
    .from(courseLessons)
    .innerJoin(courses, eq(courses.id, courseLessons.courseId))
    .where(eq(courseLessons.id, lessonId))
    .limit(1);
  return row ?? null;
}

export async function deleteLessonById(db: Db, lessonId: string): Promise<void> {
  await db.delete(courseLessons).where(eq(courseLessons.id, lessonId));
}

/** Every lesson's id + required flag — the input to course completion. */
export async function listLessonRequirements(db: Db, courseId: string) {
  return db.select({
    id: courseLessons.id,
    isRequired: courseLessons.isRequired,
  })
    .from(courseLessons)
    .where(eq(courseLessons.courseId, courseId));
}

/** Lesson totals per course in one grouped query (no N+1). */
export async function countLessonsByCourse(db: Db, courseIds: string[]): Promise<Map<string, number>> {
  if (courseIds.length === 0) return new Map();
  const counts = await db
    .select({ courseId: courseLessons.courseId, n: sql<number>`count(*)::int` })
    .from(courseLessons)
    .where(inArray(courseLessons.courseId, courseIds))
    .groupBy(courseLessons.courseId);
  return new Map(counts.map((r) => [r.courseId, Number(r.n) || 0]));
}

export async function lessonBelongsToCourse(db: Db, lessonId: string, courseId: string): Promise<boolean> {
  const [row] = await db.select({ id: courseLessons.id })
    .from(courseLessons)
    .where(and(eq(courseLessons.id, lessonId), eq(courseLessons.courseId, courseId)))
    .limit(1);
  return row != null;
}

/** Published studio slugs keyed by project id; projects without a slug are omitted. */
export async function findStudioSlugsByProjectIds(db: Db, projectIds: string[]): Promise<Map<string, string>> {
  if (projectIds.length === 0) return new Map();
  const rows = await db
    .select({ id: studioProjects.id, slug: studioProjects.slug })
    .from(studioProjects)
    .where(inArray(studioProjects.id, projectIds));
  return new Map(
    rows
      .filter((r) => r.slug != null)
      .map((r) => [r.id, r.slug as string]),
  );
}
