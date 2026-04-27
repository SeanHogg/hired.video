/**
 * Application-service / use-case layer for "publish a compiled studio video
 * to a connected YouTube channel" (#202).
 *
 * Owns the orchestration that previously lived in the route handler:
 *   1. Load the video + verify ownership.
 *   2. Resolve the caller's active YouTube account.
 *   3. Get a fresh access token (refresh if needed).
 *   4. Fetch the compiled MP4 from the CDN.
 *   5. Upload via the Data API v3 multipart endpoint.
 *   6. Persist the returned IDs back onto the video row.
 *
 * The route handler's job shrinks to: validate body → call this use case →
 * map the domain error kind to a status code → return.
 *
 * Errors thrown here are typed (`PublishVideoError`) with a discriminated
 * `kind` so the HTTP layer never has to string-match. The use case has
 * **zero Hono / Context awareness** — it can be reused from a cron job,
 * a queue consumer, or a CLI script.
 */

import { and, eq } from "drizzle-orm";
import type { Db } from "../../db/index.js";
import { getDb, schema } from "../../db/index.js";
import { cdnUrl } from "../../utils/cdn.js";
import {
  getActiveAccount as defaultGetActiveAccount,
  type YouTubeAccount,
} from "./youtubeAccountRepository.js";
import {
  getFreshAccessToken as defaultGetFreshAccessToken,
  YouTubeAuthError,
  type YouTubeOAuthConfig,
} from "./youtubeOAuth.js";
import {
  uploadVideo as defaultUploadVideo,
  YouTubeUploadError,
  type YouTubeUploadMetadata,
  type YouTubeUploadResult,
} from "./youtubeUpload.js";

const { videos } = schema;

export type PublishVideoErrorKind =
  | "VIDEO_NOT_FOUND"
  | "VIDEO_NOT_READY"
  | "ACCOUNT_NOT_CONNECTED"
  | "AUTH_FAILED"
  | "MEDIA_FETCH_FAILED"
  | "UPLOAD_FAILED";

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

/** Dependency seams — every external collaborator can be overridden so
 *  the use case is unit-testable without standing up a real DB / fetch. */
export interface PublishVideoDeps {
  db?: Db;
  fetchMedia?: (url: string) => Promise<Response>;
  getActiveAccount?: typeof defaultGetActiveAccount;
  getFreshAccessToken?: typeof defaultGetFreshAccessToken;
  uploadVideo?: typeof defaultUploadVideo;
}

export interface PublishVideoInput {
  userId: string;
  videoId: string;
  meta: YouTubeUploadMetadata;
  /** OAuth client credentials. The route layer projects from `Env`. */
  oauthConfig: YouTubeOAuthConfig;
}

export async function publishVideoToYouTube(
  input: PublishVideoInput,
  deps: PublishVideoDeps = {},
): Promise<YouTubeUploadResult> {
  const db = deps.db ?? getDb();
  const fetchMedia = deps.fetchMedia ?? fetch;
  const getActiveAccount = deps.getActiveAccount ?? defaultGetActiveAccount;
  const getFreshAccessToken = deps.getFreshAccessToken ?? defaultGetFreshAccessToken;
  const uploadVideo = deps.uploadVideo ?? defaultUploadVideo;

  // 1. Video exists + caller owns it.
  const [video] = await db
    .select()
    .from(videos)
    .where(and(eq(videos.id, input.videoId), eq(videos.userId, input.userId)))
    .limit(1);
  if (!video) {
    throw new PublishVideoError("VIDEO_NOT_FOUND", "Video not found");
  }
  if (!video.r2Key) {
    throw new PublishVideoError("VIDEO_NOT_READY", "The video has not finished compiling yet.");
  }

  // 2. Caller has an active YouTube account.
  const account: YouTubeAccount | null = await getActiveAccount(input.userId, db);
  if (!account) {
    throw new PublishVideoError("ACCOUNT_NOT_CONNECTED", "Connect your YouTube channel before publishing.");
  }

  // 3. Fresh access token (refresh on cache-miss / expiry).
  let accessToken: string;
  try {
    accessToken = await getFreshAccessToken(input.oauthConfig, account);
  } catch (err) {
    if (err instanceof YouTubeAuthError) {
      throw new PublishVideoError("AUTH_FAILED", `Reconnect your YouTube channel: ${err.message}`, err);
    }
    throw err;
  }

  // 4. Pull compiled MP4 bytes from the CDN.
  const mediaRes = await fetchMedia(cdnUrl(video.r2Key));
  if (!mediaRes.ok) {
    throw new PublishVideoError(
      "MEDIA_FETCH_FAILED",
      `Failed to fetch compiled video: ${mediaRes.status}`,
    );
  }
  const mediaBytes = new Uint8Array(await mediaRes.arrayBuffer());

  // 5. Multipart upload.
  let result: YouTubeUploadResult;
  try {
    result = await uploadVideo(accessToken, input.meta, mediaBytes);
  } catch (err) {
    if (err instanceof YouTubeUploadError) {
      throw new PublishVideoError("UPLOAD_FAILED", err.message, err);
    }
    throw err;
  }

  // 6. Persist the YouTube IDs on the video row.
  await db.update(videos)
    .set({
      youtubeVideoId: result.youtubeVideoId,
      youtubeUrl:     result.youtubeUrl,
      updatedAt:      new Date(),
    } as any)
    .where(eq(videos.id, video.id));

  return result;
}
