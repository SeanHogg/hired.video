/**
 * Skills demonstration videos — the `studio_skills_demos` table. Writes are
 * scoped to the owning user; the profile read only returns `is_public` rows.
 */
import { and, desc, eq } from "drizzle-orm";
import { schema, type Db } from "../db/index.js";

const { studioSkillsDemos } = schema;

export type SkillsDemoRow = typeof studioSkillsDemos.$inferSelect;
export type SkillsDemoInsert = typeof studioSkillsDemos.$inferInsert;
export type SkillsDemoPatch = Partial<Pick<SkillsDemoInsert,
  "videoUrl" | "thumbnailUrl" | "durationMs" | "isPublic" | "title" | "description">>;

export async function insertSkillsDemo(db: Db, values: SkillsDemoInsert): Promise<SkillsDemoRow> {
  const [row] = await db.insert(studioSkillsDemos).values(values).returning();
  return row;
}

/** Patch + bump updatedAt; null when the user owns no such demo. */
export async function updateOwnedSkillsDemo(
  db: Db,
  id: string,
  userId: string,
  patch: SkillsDemoPatch,
): Promise<SkillsDemoRow | null> {
  const [row] = await db.update(studioSkillsDemos)
    .set({ ...patch, updatedAt: new Date() })
    .where(and(eq(studioSkillsDemos.id, id), eq(studioSkillsDemos.userId, userId)))
    .returning();
  return row ?? null;
}

/** A user's demos, most recently updated first. `publicOnly` = profile view. */
export async function listSkillsDemosByUser(
  db: Db,
  userId: string,
  opts: { publicOnly: boolean; limit: number },
): Promise<SkillsDemoRow[]> {
  const where = opts.publicOnly
    ? and(eq(studioSkillsDemos.userId, userId), eq(studioSkillsDemos.isPublic, true))
    : eq(studioSkillsDemos.userId, userId);
  return db.select().from(studioSkillsDemos)
    .where(where)
    .orderBy(desc(studioSkillsDemos.updatedAt))
    .limit(opts.limit);
}
