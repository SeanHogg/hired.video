/**
 * Per-view watch heatmaps (#122) — the `studio_video_heatmap` table, keyed by
 * studio project.
 */
import { desc, eq } from "drizzle-orm";
import { schema, type Db } from "../db/index.js";

const { studioVideoHeatmap } = schema;

export type VideoHeatmapRow = typeof studioVideoHeatmap.$inferSelect;
export type VideoHeatmapInsert = typeof studioVideoHeatmap.$inferInsert;

export async function insertVideoHeatmap(db: Db, values: VideoHeatmapInsert): Promise<VideoHeatmapRow> {
  const [row] = await db.insert(studioVideoHeatmap).values(values).returning();
  return row;
}

/** Up to `limit` views of a project; `newestFirst` orders by createdAt DESC
 *  (unordered otherwise). */
export async function listVideoHeatmapViews(
  db: Db,
  projectId: string,
  opts: { limit: number; newestFirst: boolean },
): Promise<VideoHeatmapRow[]> {
  const where = eq(studioVideoHeatmap.studioProjectId, projectId);
  if (opts.newestFirst) {
    return db.select().from(studioVideoHeatmap)
      .where(where)
      .orderBy(desc(studioVideoHeatmap.createdAt))
      .limit(opts.limit);
  }
  return db.select().from(studioVideoHeatmap).where(where).limit(opts.limit);
}
