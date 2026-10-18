/**
 * Auto-captions (SRT / WebVTT) — the `studio_captions` table, scoped to the
 * owning user.
 */
import { and, desc, eq } from "drizzle-orm";
import { schema, type Db } from "../db/index.js";

const { studioCaptions } = schema;

export type StudioCaptionRow = typeof studioCaptions.$inferSelect;
export type StudioCaptionInsert = typeof studioCaptions.$inferInsert;

export async function insertCaption(db: Db, values: StudioCaptionInsert): Promise<StudioCaptionRow> {
  const [row] = await db.insert(studioCaptions).values(values).returning();
  return row;
}

/** The user's newest caption set for a project. */
export async function findLatestCaption(db: Db, projectId: string, userId: string): Promise<StudioCaptionRow | null> {
  const [row] = await db.select().from(studioCaptions)
    .where(and(eq(studioCaptions.projectId, projectId), eq(studioCaptions.userId, userId)))
    .orderBy(desc(studioCaptions.createdAt))
    .limit(1);
  return row ?? null;
}
