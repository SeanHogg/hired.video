/**
 * AI thumbnail candidates (#142) — the `studio_thumbnails` table. Access (who
 * may act on the candidate's project) is decided by the caller.
 */
import { and, desc, eq } from "drizzle-orm";
import { schema, type Db } from "../db/index.js";

const { studioThumbnails } = schema;

export type StudioThumbnailRow = typeof studioThumbnails.$inferSelect;
export type StudioThumbnailInsert = typeof studioThumbnails.$inferInsert;

/** Drop the project's un-selected candidates (the live pick survives). */
export async function deleteUnselectedThumbnails(db: Db, projectId: string): Promise<void> {
  await db.delete(studioThumbnails).where(and(
    eq(studioThumbnails.projectId, projectId),
    eq(studioThumbnails.isSelected, false),
  ));
}

/** ONE multi-row insert. */
export async function insertThumbnails(db: Db, rows: readonly StudioThumbnailInsert[]): Promise<StudioThumbnailRow[]> {
  if (rows.length === 0) return [];
  return db.insert(studioThumbnails).values([...rows]).returning();
}

/** Every candidate of a project, best score first. */
export async function listThumbnailsByProject(db: Db, projectId: string): Promise<StudioThumbnailRow[]> {
  return db.select().from(studioThumbnails)
    .where(eq(studioThumbnails.projectId, projectId))
    .orderBy(desc(studioThumbnails.score));
}

export async function clearThumbnailSelection(db: Db, projectId: string): Promise<void> {
  await db.update(studioThumbnails)
    .set({ isSelected: false })
    .where(eq(studioThumbnails.projectId, projectId));
}

/** Mark one candidate of the project selected; null when no row matched. */
export async function markThumbnailSelected(
  db: Db,
  projectId: string,
  thumbnailId: string,
): Promise<StudioThumbnailRow | null> {
  const [row] = await db.update(studioThumbnails)
    .set({ isSelected: true })
    .where(and(eq(studioThumbnails.id, thumbnailId), eq(studioThumbnails.projectId, projectId)))
    .returning();
  return row ?? null;
}
