/**
 * Public (published + verified-author) course reads for /api/courses/public*.
 * Every read joins the author's user + profile row so the card / detail
 * payload can render the byline without a second round-trip.
 */
import { and, desc, eq } from "drizzle-orm";
import { schema, type Db } from "../db/index.js";

const { courses, courseLessons, users, userProfiles } = schema;

/** Published courses by verified authors, newest first; optionally one author's. */
export async function listPublishedCoursesWithAuthors(
  db: Db,
  opts: { limit: number; authorId?: string },
) {
  const filters = [eq(courses.status, "published"), eq(users.emailVerified, true)];
  if (opts.authorId) filters.unshift(eq(courses.userId, opts.authorId));
  return db
    .select({
      course: courses,
      author: { id: users.id, name: users.name },
      authorProfile: { avatarUrl: userProfiles.avatarUrl, customUrlSlug: userProfiles.customUrlSlug },
    })
    .from(courses)
    .innerJoin(users, eq(courses.userId, users.id))
    .leftJoin(userProfiles, eq(userProfiles.userId, users.id))
    .where(and(...filters))
    .orderBy(desc(courses.publishedAt))
    .limit(opts.limit);
}

export type PublishedCourseWithAuthor = Awaited<ReturnType<typeof listPublishedCoursesWithAuthors>>[number];

/** One published course by (author, slug) with the author's public bio fields. */
export async function findPublishedCourseByAuthorSlug(db: Db, authorId: string, slug: string) {
  const [row] = await db
    .select({
      course: courses,
      author: { id: users.id, name: users.name },
      authorProfile: {
        avatarUrl: userProfiles.avatarUrl,
        customUrlSlug: userProfiles.customUrlSlug,
        headline: userProfiles.headline,
        summary: userProfiles.summary,
      },
    })
    .from(courses)
    .innerJoin(users, eq(courses.userId, users.id))
    .leftJoin(userProfiles, eq(userProfiles.userId, users.id))
    .where(and(
      eq(courses.userId, authorId),
      eq(courses.slug, slug),
      eq(courses.status, "published"),
      eq(users.emailVerified, true),
    ))
    .limit(1);
  return row ?? null;
}

/** Public lesson outline — no bodies / SCORM URLs leak to anonymous viewers. */
export async function listPublicLessonOutline(db: Db, courseId: string) {
  return db.select({
    id: courseLessons.id,
    moduleId: courseLessons.moduleId,
    title: courseLessons.title,
    summary: courseLessons.summary,
    sourceType: courseLessons.sourceType,
    estimatedMinutes: courseLessons.estimatedMinutes,
    isRequired: courseLessons.isRequired,
    sortOrder: courseLessons.sortOrder,
  }).from(courseLessons)
    .where(eq(courseLessons.courseId, courseId))
    .orderBy(courseLessons.sortOrder);
}
