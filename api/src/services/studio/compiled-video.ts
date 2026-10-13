/**
 * The compiled (rendered) video behind a Studio project — the row every
 * publish path posts: the social publish use case (every network, YouTube
 * included) and the brand-channel promotion queue.
 *
 *   requireCompiledVideo     the owned row with an R2 key (else NOT_FOUND / NOT_READY)
 *   fetchCompiledVideoBytes  its MP4 bytes straight from R2, for push-upload adapters
 *   linkYouTubeUpload        a YouTube post also lands on the row (youtubeVideoId/Url),
 *                            which the public video pages and feed read
 *
 * Errors are typed (`PublishVideoError`) so callers map a kind, never a string.
 */
import { and, eq } from "drizzle-orm";
import type { Db } from "../../db/index.js";
import { schema } from "../../db/index.js";
import { cdnUrl } from "../../utils/cdn.js";
import { getVideoBucket } from "../storage/object-store.js";
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

/** Reads one stored object's bytes by R2 key; null when it isn't there. */
export type ReadMedia = (key: string) => Promise<Uint8Array | null>;

/**
 * The bucket binding — NEVER an HTTP fetch of cdn.hired.video: that host is
 * a route on THIS Worker, and a Worker calling its own route answers 522
 * (every LinkedIn / YouTube post failed that way, 2026-10-13). Without a
 * binding (Node scripts, local dev) it falls back to the public CDN URL.
 */
export const readMediaFromBucket: ReadMedia = async (key) => {
  const bucket = getVideoBucket();
  if (bucket) {
    const object = await bucket.get(key);
    return object ? new Uint8Array(await object.arrayBuffer()) : null;
  }
  const res = await fetch(cdnUrl(key));
  if (!res.ok) throw new PublishVideoError("MEDIA_FETCH_FAILED", `Failed to fetch compiled video: ${res.status}`);
  return new Uint8Array(await res.arrayBuffer());
};

/** A compiled video's MP4 bytes (MEDIA_FETCH_FAILED when the object is missing). */
export async function fetchCompiledVideoBytes(
  video: CompiledVideoRow,
  readMedia: ReadMedia = readMediaFromBucket,
): Promise<Uint8Array> {
  const bytes = await readMedia(video.r2Key!);
  if (!bytes) {
    throw new PublishVideoError("MEDIA_FETCH_FAILED", `Compiled video is missing from storage: ${video.r2Key}`);
  }
  return bytes;
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
