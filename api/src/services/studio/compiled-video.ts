/**
 * The compiled (rendered) video behind a Studio project — the row every
 * publish path posts: the social publish use case (every network, YouTube
 * included) and the brand-channel promotion queue.
 *
 *   requireCompiledVideo     the owned row with an R2 key (else NOT_FOUND / NOT_READY)
 *   fetchCompiledVideoBytes  its MP4 bytes from the CDN, for push-upload adapters
 *   linkYouTubeUpload        a YouTube post also lands on the row (youtubeVideoId/Url),
 *                            which the public video pages and feed read
 *
 * Errors are typed (`PublishVideoError`) so callers map a kind, never a string.
 */
import { and, eq } from "drizzle-orm";
import type { Db } from "../../db/index.js";
import { schema } from "../../db/index.js";
import { cdnUrl } from "../../utils/cdn.js";
import { invalidatePublicVideoFeed } from "./public-video-feed.js";

const { videos } = schema;

export type PublishVideoErrorKind = "VIDEO_NOT_FOUND" | "VIDEO_NOT_READY" | "MEDIA_FETCH_FAILED";

export class PublishVideoError extends Error {
  constructor(
    public readonly kind: PublishVideoErrorKind,
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = "PublishVideoError";
  }
}

export type CompiledVideoRow = typeof videos.$inferSelect;

/** The owned, compiled video row — VIDEO_NOT_FOUND / VIDEO_NOT_READY otherwise. */
export async function requireCompiledVideo(
  db: Db,
  args: { videoId: string; ownerUserId: string },
): Promise<CompiledVideoRow> {
  const [video] = await db
    .select()
    .from(videos)
    .where(and(eq(videos.id, args.videoId), eq(videos.userId, args.ownerUserId)))
    .limit(1);
  if (!video) throw new PublishVideoError("VIDEO_NOT_FOUND", "Video not found");
  if (!video.r2Key) throw new PublishVideoError("VIDEO_NOT_READY", "The video has not finished compiling yet.");
  return video;
}

/** Pull a compiled video's MP4 bytes from the CDN (MEDIA_FETCH_FAILED). */
export async function fetchCompiledVideoBytes(
  video: CompiledVideoRow,
  fetchMedia: (url: string) => Promise<Response> = fetch,
): Promise<Uint8Array> {
  const mediaRes = await fetchMedia(cdnUrl(video.r2Key!));
  if (!mediaRes.ok) {
    throw new PublishVideoError("MEDIA_FETCH_FAILED", `Failed to fetch compiled video: ${mediaRes.status}`);
  }
  return new Uint8Array(await mediaRes.arrayBuffer());
}

/** Record a YouTube upload on the video row (the public pages link to it). */
export async function linkYouTubeUpload(
  db: Db,
  videoId: string,
  upload: { externalId: string; externalUrl: string | null },
): Promise<void> {
  await db
    .update(videos)
    .set({ youtubeVideoId: upload.externalId, youtubeUrl: upload.externalUrl, updatedAt: new Date() })
    .where(eq(videos.id, videoId));
  invalidatePublicVideoFeed();
}
