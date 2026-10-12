/**
 * Delete a Studio project together with the video files it owns — the ONE
 * project-delete path (user, NLE and SuperAdmin routes).
 *
 * `studio_projects.video_id` has no FK, and a fitted cut's `videos` row is
 * referenced BY its variant row (not the other way), so deleting a project
 * used to leave its master render and every cut as orphan `videos` rows with
 * their R2 objects in the bucket. Here:
 *
 *   1. collect the master's video (only when no other project points at the
 *      same row) and the project's cut videos — before the cascade drops the
 *      variant rows that link them;
 *   2. delete the project (variant rows cascade; publications go with it);
 *   3. delete those `videos` rows, in bounded batches;
 *   4. reclaim their R2 objects through `reclaimVideoR2` (best-effort,
 *      batched by `deleteR2Keys`) — never fails the delete.
 *
 * Every collaborator is injectable so the flow is unit-testable without a DB or R2.
 */
import { and, eq, inArray, ne } from "drizzle-orm";
import { getDb, schema } from "../../db/index.js";
import { studioProjectRenderVariants as variants } from "../../db/schema/renderVariants.js";
import { reclaimVideoR2 } from "../storage/reclaim-video-r2.js";
import { invalidatePublicVideoFeed } from "./public-video-feed.js";

type Db = ReturnType<typeof getDb>;

/** Upper bound on the cuts collected per project (superseded revisions are
 *  reclaimed as they're replaced, so a project holds one per key). */
export const MAX_PROJECT_CUTS = 200;
/** `videos` rows deleted per statement. */
export const VIDEO_DELETE_BATCH = 100;

export interface DeleteProjectMediaDeps {
  db?: Db;
  reclaim?: typeof reclaimVideoR2;
  onVideosDeleted?: () => void;
}

/** Deletes the project and its video files. False when there was no such project. */
export async function deleteProjectWithMedia(projectId: string, deps: DeleteProjectMediaDeps = {}): Promise<boolean> {
  const db = deps.db ?? getDb();
  const { studioProjects, videos } = schema;

  const [project] = await db
    .select({ id: studioProjects.id, videoId: studioProjects.videoId })
    .from(studioProjects)
    .where(eq(studioProjects.id, projectId))
    .limit(1);
  if (!project) return false;

  const owned: Array<{ id: string; r2Key: string | null }> = await db
    .select({ id: videos.id, r2Key: videos.r2Key })
    .from(variants)
    .innerJoin(videos, eq(videos.id, variants.videoId))
    .where(eq(variants.projectId, projectId))
    .limit(MAX_PROJECT_CUTS);

  if (project.videoId) {
    const [sharedWith] = await db
      .select({ id: studioProjects.id })
      .from(studioProjects)
      .where(and(eq(studioProjects.videoId, project.videoId), ne(studioProjects.id, projectId)))
      .limit(1);
    if (!sharedWith) {
      const [master] = await db
        .select({ id: videos.id, r2Key: videos.r2Key })
        .from(videos)
        .where(eq(videos.id, project.videoId))
        .limit(1);
      if (master) owned.push(master);
    }
  }

  await db.delete(studioProjects).where(eq(studioProjects.id, projectId));

  for (let i = 0; i < owned.length; i += VIDEO_DELETE_BATCH) {
    const ids = owned.slice(i, i + VIDEO_DELETE_BATCH).map((v) => v.id);
    await db.delete(videos).where(inArray(videos.id, ids));
  }
  if (owned.length > 0) (deps.onVideosDeleted ?? invalidatePublicVideoFeed)();

  try {
    await (deps.reclaim ?? reclaimVideoR2)(owned);
  } catch (err) {
    console.warn("[delete-project-media] R2 reclaim failed:", projectId, err instanceof Error ? err.message : err);
  }
  return true;
}
