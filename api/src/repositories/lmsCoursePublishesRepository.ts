/**
 * LMS course publishes (#200) — one row per push of a course to a connected
 * LMS (`lms_course_publishes`): pending → published | failed.
 */
import { desc, eq } from "drizzle-orm";
import { schema, type Db } from "../db/index.js";

export { LMS_PROVIDERS, type LmsProvider } from "../db/schema/courses.js";

const { lmsCoursePublishes } = schema;

export type LmsCoursePublishRow = typeof lmsCoursePublishes.$inferSelect;

export async function insertPendingLmsPublish(
  db: Db,
  values: { connectorId: string; courseId: string },
): Promise<LmsCoursePublishRow> {
  const [row] = await db.insert(lmsCoursePublishes).values({ ...values, status: "pending" }).returning();
  return row;
}

export async function markLmsPublishPublished(
  db: Db,
  id: string,
  externalId: string,
  now: Date,
): Promise<LmsCoursePublishRow | undefined> {
  const [row] = await db.update(lmsCoursePublishes)
    .set({ externalId, status: "published", pushedAt: now, updatedAt: now })
    .where(eq(lmsCoursePublishes.id, id))
    .returning();
  return row;
}

export async function markLmsPublishFailed(db: Db, id: string, lastError: string, now: Date): Promise<void> {
  await db.update(lmsCoursePublishes)
    .set({ status: "failed", lastError, updatedAt: now })
    .where(eq(lmsCoursePublishes.id, id));
}

export async function listLmsPublishesByCourse(db: Db, courseId: string): Promise<LmsCoursePublishRow[]> {
  return db.select().from(lmsCoursePublishes)
    .where(eq(lmsCoursePublishes.courseId, courseId))
    .orderBy(desc(lmsCoursePublishes.createdAt));
}
