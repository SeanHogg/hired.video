/**
 * Lookups behind the public watch payload (`GET /api/studio/public/:videoId`):
 * the studio project by id or vanity slug (with owner), the rendered video
 * by id / YouTube id, and the Timeline the CTA hot-zones are read from.
 */
import { eq, or } from "drizzle-orm";
import { schema, type Db } from "../db/index.js";
import { stateToFields } from "../../../shared/studio-project-state.js";

const { studioProjects, videos, users, userProfiles } = schema;

export interface WatchProjectRow {
  id: string;
  videoId: string | null;
  isPublic: boolean;
  status: string | null;
  kind: string | null;
  mediaKind: string | null;
  storyboard: unknown;
  name: string | null;
  /** Runtime state, shaped by `mediaKind` (shared/studio-project-state.ts). */
  state: unknown;
  ownerName: string | null;
  ownerAvatar: string | null;
}

const projectSelect = {
  id: studioProjects.id,
  videoId: studioProjects.videoId,
  isPublic: studioProjects.isPublic,
  status: studioProjects.status,
  kind: studioProjects.kind,
  mediaKind: studioProjects.mediaKind,
  storyboard: studioProjects.storyboard,
  name: studioProjects.name,
  state: studioProjects.state,
  ownerName: users.name,
  ownerAvatar: userProfiles.avatarUrl,
};

/** The project (plus owner name/avatar) by UUID or by its indexed vanity
 *  slug (migration 0141). */
export async function findWatchProject(db: Db, by: { id: string } | { slug: string }): Promise<WatchProjectRow | null> {
  const [proj] = await db
    .select(projectSelect)
    .from(studioProjects)
    .innerJoin(users, eq(studioProjects.userId, users.id))
    .leftJoin(userProfiles, eq(userProfiles.userId, users.id))
    .where("id" in by ? eq(studioProjects.id, by.id) : eq(studioProjects.slug, by.slug))
    .limit(1);
  return proj ?? null;
}

/**
 * The rendered video: by its id when a project resolved one, otherwise by
 * the raw param — `videos.id` or `videos.youtubeVideoId` when it looks like
 * a UUID, `youtubeVideoId` only when it doesn't.
 */
export async function findWatchVideo(
  db: Db,
  lookup: { resolvedVideoId: string | null; param: string; paramIsUuid: boolean },
) {
  const condition = lookup.resolvedVideoId
    ? eq(videos.id, lookup.resolvedVideoId)
    : lookup.paramIsUuid
      ? or(eq(videos.id, lookup.param), eq(videos.youtubeVideoId, lookup.param))
      : eq(videos.youtubeVideoId, lookup.param);
  const [row] = await db
    .select({
      id: videos.id,
      title: videos.title,
      description: videos.description,
      youtubeUrl: videos.youtubeUrl,
      youtubeVideoId: videos.youtubeVideoId,
      r2Key: videos.r2Key,
      thumbnailUrl: videos.thumbnailUrl,
      privacyStatus: videos.privacyStatus,
      createdAt: videos.createdAt,
      // Render-time VideoScript snapshot (aspect / resolution fallback).
      storyboard: videos.storyboard,
      ownerName: users.name,
      ownerAvatar: userProfiles.avatarUrl,
      resumeId: videos.resumeId,
    })
    .from(videos)
    .innerJoin(users, eq(videos.userId, users.id))
    .leftJoin(userProfiles, eq(userProfiles.userId, users.id))
    .where(condition)
    .limit(1);
  return row ?? null;
}

export type WatchVideoRow = NonNullable<Awaited<ReturnType<typeof findWatchVideo>>>;

/** The Timeline (for CTA hot-zones) of a project, by project id or by the
 *  rendered video it owns. `timelineSpec` is null for a non-Timeline kind. */
export async function findProjectTimeline(
  db: Db,
  by: { projectId: string } | { videoId: string },
): Promise<{ id: string; timelineSpec: unknown } | null> {
  const [proj] = await db
    .select({ id: studioProjects.id, mediaKind: studioProjects.mediaKind, state: studioProjects.state })
    .from(studioProjects)
    .where("projectId" in by ? eq(studioProjects.id, by.projectId) : eq(studioProjects.videoId, by.videoId))
    .limit(1);
  if (!proj) return null;
  return { id: proj.id, timelineSpec: stateToFields(proj.mediaKind, proj.state).timelineSpec };
}
