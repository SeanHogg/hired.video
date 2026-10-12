/**
 * Course deep-clone persistence (POST /api/courses/:id/clone).
 *
 * Fixed query count regardless of course size:
 *   - slug probe: ONE `slug IN (...)` lookup instead of one query per suffix;
 *   - modules + lessons: read each tree once, then ONE multi-row insert each.
 *     New module ids are minted up-front (crypto.randomUUID) so lesson FKs are
 *     remapped in memory — no per-module `RETURNING` round-trip needed.
 */
import { and, eq, inArray } from "drizzle-orm";
import { schema, type Db } from "../db/index.js";

const { courses, courseModules, courseLessons } = schema;

/** Highest numeric suffix probed before falling back to `${base}-${MAX}`. */
const MAX_SLUG_SUFFIX = 50;

/**
 * First slug in `[base, base-2, …, base-49]` the user doesn't already own;
 * `base-50` when every candidate is taken (mirrors the old probe loop).
 * `slug` is unique per (userId, slug), so only the caller's catalog matters.
 */
export async function pickFreeCourseSlug(db: Db, userId: string, baseSlug: string): Promise<string> {
  const candidates = [baseSlug];
  for (let i = 2; i < MAX_SLUG_SUFFIX; i++) candidates.push(`${baseSlug}-${i}`);
  const taken = await db
    .select({ slug: courses.slug })
    .from(courses)
    .where(and(eq(courses.userId, userId), inArray(courses.slug, candidates)));
  const takenSet = new Set(taken.map((r) => r.slug));
  return candidates.find((s) => !takenSet.has(s)) ?? `${baseSlug}-${MAX_SLUG_SUFFIX}`;
}

/** Copy every module + lesson of `sourceCourseId` onto `targetCourseId`. */
export async function cloneCourseModulesAndLessons(
  db: Db,
  sourceCourseId: string,
  targetCourseId: string,
): Promise<void> {
  const [originalModules, originalLessons] = await Promise.all([
    db.select().from(courseModules)
      .where(eq(courseModules.courseId, sourceCourseId))
      .orderBy(courseModules.sortOrder),
    db.select().from(courseLessons)
      .where(eq(courseLessons.courseId, sourceCourseId))
      .orderBy(courseLessons.sortOrder),
  ]);

  const moduleIdMap = new Map<string, string>();
  const moduleRows = originalModules.map((m) => {
    const { id, createdAt: _c, updatedAt: _u, courseId: _cid, ...mRest } = m;
    const newId = crypto.randomUUID();
    moduleIdMap.set(id, newId);
    return { ...mRest, id: newId, courseId: targetCourseId };
  });
  if (moduleRows.length > 0) {
    await db.insert(courseModules).values(moduleRows);
  }

  const lessonRows = originalLessons.map((l) => {
    const { id: _lid, createdAt: _c, updatedAt: _u, courseId: _cid, moduleId, ...lRest } = l;
    return {
      ...lRest,
      courseId: targetCourseId,
      moduleId: moduleId ? moduleIdMap.get(moduleId) ?? null : null,
    };
  });
  if (lessonRows.length > 0) {
    await db.insert(courseLessons).values(lessonRows);
  }
}
