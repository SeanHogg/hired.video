/**
 * Video chapters + TOC (#141) — the `studio_chapters` table. Access (who may
 * act on the chapter's project) is decided by the caller.
 */
import { eq } from "drizzle-orm";
import { schema, type Db } from "../db/index.js";

const { studioChapters } = schema;

export type StudioChapterRow = typeof studioChapters.$inferSelect;
export type StudioChapterInsert = typeof studioChapters.$inferInsert;
export type StudioChapterPatch = Partial<Pick<StudioChapterInsert, "title" | "startSeconds" | "thumbnailUrl">>;

export function createStudioChaptersRepository(db: Db) {
  return {
    async listByProject(projectId: string): Promise<StudioChapterRow[]> {
      return db
        .select()
        .from(studioChapters)
        .where(eq(studioChapters.projectId, projectId))
        .orderBy(studioChapters.startSeconds);
    },

    async deleteByProject(projectId: string): Promise<void> {
      await db.delete(studioChapters).where(eq(studioChapters.projectId, projectId));
    },

    /** ONE multi-row insert. */
    async insertMany(rows: readonly StudioChapterInsert[]): Promise<StudioChapterRow[]> {
      if (rows.length === 0) return [];
      return db.insert(studioChapters).values([...rows]).returning();
    },

    async update(id: string, patch: StudioChapterPatch): Promise<StudioChapterRow | null> {
      const [row] = await db
        .update(studioChapters)
        .set({ ...patch, updatedAt: new Date() })
        .where(eq(studioChapters.id, id))
        .returning();
      return row ?? null;
    },

    /** The deleted id, or null when no row matched. */
    async deleteById(id: string): Promise<string | null> {
      const [row] = await db
        .delete(studioChapters)
        .where(eq(studioChapters.id, id))
        .returning({ id: studioChapters.id });
      return row?.id ?? null;
    },
  };
}

export type StudioChaptersRepository = ReturnType<typeof createStudioChaptersRepository>;
