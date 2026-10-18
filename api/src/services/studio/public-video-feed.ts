/**
 * The public video feed — the 20 most recent public videos, read by the
 * discovery card feed and the home page's "Watch people get seen" wall
 * (`GET /api/studio/public`).
 *
 * Served through the shared read-through cache (L1 + KV) and kept until a
 * video changes: EVERY writer of the `videos` table calls
 * `invalidatePublicVideoFeed()` after its write, so a new public video
 * (or one made private / deleted) shows on the next read; so does the
 * profile update (PUT /api/users/me), since cards show the owner's name and
 * headline. A goal edited on an already-public video's résumé shows after
 * the TTL (résumé autosaves don't invalidate the feed: they're hot and the
 * theme is frozen into the plan before the video goes public). The TTL is only
 * a backstop for a writer that misses the call.
 *
 * Explicit-scan gate (migration 0505): only videos whose effective scan
 * verdict is `pass` are served (unscanned / unscreened / blocked fail closed);
 * an owner headline whose latest save-time scan did not pass is left off the
 * card. services/moderation/explicit invalidates this feed when a verdict flips.
 *
 * mediaKind is always "video": the source is the `videos` baked-artifact
 * table, which only carries renders. Cross-kind discovery reads
 * /videos/featured or /videos/user/:userId (the projects table).
 */
import { and, desc, eq, sql, type AnyColumn } from "drizzle-orm";
import { isNotRenderVariant } from "../../repositories/renderVariantRepository.js";
import { alias } from "drizzle-orm/pg-core";
import { getDb, type Db } from "../../db/index.js";
import { contentScans } from "../../db/schema/contentScans.js";
import { userProfiles, users } from "../../db/schema/users.js";
import { resumeInformation } from "../../db/schema/resumes.js";
import { isVideoThemeId } from "../../../../shared/video-themes.js";
import { VIDEO_GOALS, type VideoGoal } from "../../../../shared/video-targeting.js";
import { videos } from "../../db/schema/videos.js";
import { cdnUrl } from "../../utils/cdn.js";
import { getOrSetCached, invalidateCachedKey } from "../../utils/edge-cache.js";

const FEED_KEY = "studio:v1:public-videos";
const FEED_LIMIT = 20;
/** Backstop only — writers invalidate. */
const FEED_TTL_SECONDS = 600;

/** The owner's save-time profile-text scan (name + headline). */
const profileScans = alias(contentScans, "profile_scan");
const effective = (t: { overrideVerdict: AnyColumn; verdict: AnyColumn }) => sql`coalesce(${t.overrideVerdict}, ${t.verdict})`;

const PUBLIC_VIDEO_SELECT = {
  id: videos.id,
  title: videos.title,
  youtubeUrl: videos.youtubeUrl,
  youtubeVideoId: videos.youtubeVideoId,
  r2Key: videos.r2Key,
  thumbnailUrl: videos.thumbnailUrl,
  description: videos.description,
  createdAt: videos.createdAt,
  ownerId: users.id,
  ownerName: users.name,
  // Shown unless the latest save-time scan of the profile text did not pass.
  ownerHeadline: sql<string | null>`CASE WHEN ${profileScans.id} IS NULL OR ${effective(profileScans)} = 'pass' THEN ${userProfiles.headline} ELSE NULL END`,
  resumeId: videos.resumeId,
  // The theme the video wore when posted and its goal live on the résumé's
  // video plan (posting freezes the theme there) — read from its typed
  // mirror columns (migration 0615), not copied onto the video.
  themeId: resumeInformation.videoThemeId,
  goal: resumeInformation.videoGoal,
} as const;

interface PublicVideoRow {
  id: string;
  title: string | null;
  youtubeUrl: string | null;
  youtubeVideoId: string | null;
  r2Key: string | null;
  thumbnailUrl: string | null;
  description: string | null;
  createdAt: Date | string | null;
  ownerId: string;
  ownerName: string | null;
  ownerHeadline: string | null;
  resumeId: string | null;
  themeId: string | null;
  goal: string | null;
}

export type PublicVideoFeedItem = ReturnType<typeof mapPublicVideo>;

function isoOf(value: Date | string | null): string {
  if (!value) return new Date().toISOString();
  return (value instanceof Date ? value : new Date(value)).toISOString();
}

function mapPublicVideo(v: PublicVideoRow) {
  return {
    id: v.id,
    title: v.title || `${v.ownerName}'s Video Resume`,
    videoUrl: v.youtubeUrl ?? (v.r2Key ? cdnUrl(v.r2Key) : null),
    youtubeUrl: v.youtubeUrl,
    youtubeVideoId: v.youtubeVideoId,
    thumbnailUrl: v.thumbnailUrl,
    description: v.description,
    // Featured rows are served by /videos/featured (studio_projects.is_featured).
    isFeatured: false,
    ownerId: v.ownerId,
    ownerName: v.ownerName ?? "",
    ownerHeadline: v.ownerHeadline,
    resumeId: v.resumeId,
    themeId: isVideoThemeId(v.themeId) ? v.themeId : null,
    goal: (VIDEO_GOALS as readonly string[]).includes(v.goal ?? "") ? (v.goal as VideoGoal) : null,
    mediaKind: "video" as const,
    timelineSpec: null,
    gameState: null,
    imageState: null,
    animationState: null,
    cadState: null,
    comicState: null,
    createdAt: isoOf(v.createdAt),
  };
}

/** The feed query — exported so a test can assert the scan gate in its SQL. */
export function publicVideoFeedQuery(db: Db) {
  return db
    .select(PUBLIC_VIDEO_SELECT)
    .from(videos)
    .innerJoin(users, eq(videos.userId, users.id))
    // The explicit-scan gate: no passing `video` scan, no wall.
    .innerJoin(contentScans, and(
      eq(contentScans.subjectType, "video"),
      eq(contentScans.subjectId, sql`${videos.id}::text`),
      sql`${effective(contentScans)} = 'pass'`,
    ))
    .leftJoin(userProfiles, eq(userProfiles.userId, users.id))
    .leftJoin(profileScans, and(
      eq(profileScans.subjectType, "profile"),
      eq(profileScans.subjectId, sql`${users.id}::text`),
    ))
    .leftJoin(resumeInformation, eq(resumeInformation.id, videos.resumeId))
    .where(and(eq(videos.privacyStatus, "public"), eq(videos.showOnHome, true), isNotRenderVariant(videos.id)))
    .orderBy(desc(videos.createdAt))
    .limit(FEED_LIMIT);
}

async function loadPublicVideoFeed(): Promise<PublicVideoFeedItem[]> {
  const rows = await publicVideoFeedQuery(getDb());
  return rows.map(mapPublicVideo);
}

/** The feed, cached until a video changes. DB errors propagate (never cached). */
export function getPublicVideoFeed(): Promise<PublicVideoFeedItem[]> {
  return getOrSetCached({ key: FEED_KEY, ttlSeconds: FEED_TTL_SECONDS, loader: loadPublicVideoFeed });
}

/** Call after ANY insert / update / delete on `videos`. */
export function invalidatePublicVideoFeed(): void {
  invalidateCachedKey(FEED_KEY);
}
