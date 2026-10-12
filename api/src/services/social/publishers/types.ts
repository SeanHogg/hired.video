/**
 * The social video publisher port — ONE contract every platform adapter
 * (youtube.ts, tiktok.ts, instagram.ts, x.ts, facebook.ts, linkedin.ts) implements, so the publish
 * use case (publish-project-video.ts) never names a platform's endpoints.
 *
 * Adapters are lane-agnostic: they take an access token and the rendered
 * video, nothing about who owns the connection. Lane B (the user's own
 * account) passes the user's token; Lane A (hired.video's brand account)
 * can pass the managed token through the same adapters.
 *
 * Adding a platform = one adapter file + one registry entry (index.ts).
 */
import type { VideoPublishPlatform } from "../../../../../shared/social-platforms.js";
import type { TikTokPostSettings } from "../../../../../shared/tiktok-post-settings.js";

export interface SocialVideoInput {
  /** Public CDN URL of the rendered MP4 (for pull-from-URL platforms). */
  url: string;
  /** Loads the MP4 bytes (for push-upload platforms). Called at most once. */
  bytes: () => Promise<Uint8Array>;
}

export interface SocialPublishRequest {
  accessToken: string;
  video: SocialVideoInput;
  /** Post text / description. Adapters trim to their platform's limit. */
  caption: string;
  /** Short title (platforms that carry one separately from the caption). */
  title: string;
  /** The creator's TikTok choices (privacy, interactions, disclosure). Lane B
   *  must send them (TikTok's sharing guidelines); without them the TikTok
   *  adapter falls back to the most public level the account allows. */
  tiktok?: TikTokPostSettings;
  /** YouTube's own choices. Absent → unlisted, no tags. */
  youtube?: YouTubePostSettings;
}

export interface YouTubePostSettings {
  privacy: "public" | "private" | "unlisted";
  tags?: string[];
  /** The cut is a vertical Short (≤ 3 min) — the adapter tags it `#Shorts`. */
  shorts?: boolean;
}

export interface SocialPublishResult {
  /** Platform-side id of the post (or of the publish job when the platform
   *  finishes asynchronously and the post id isn't known yet). */
  externalId: string;
  /** Public link to the post, when the platform returns one. */
  externalUrl: string | null;
}

export interface SocialVideoPublisher {
  platform: VideoPublishPlatform;
  publish(req: SocialPublishRequest): Promise<SocialPublishResult>;
}

/**
 * Reads lifetime view counts for posts an adapter published, keyed by the
 * `externalId` the publish returned. Ids the platform doesn't answer for
 * (deleted post, unfinished async publish) are left out of the map, so the
 * caller reports "unknown" rather than zero.
 */
export type SocialViewReader = (accessToken: string, externalIds: string[]) => Promise<Map<string, number>>;

/**
 * A post's counts as one stats call reports them (#2048). `views` is always
 * present for an answered id; the engagement counts are null where the
 * network's stats call doesn't carry them (never a made-up zero).
 */
export interface PostMetrics {
  views: number;
  likes: number | null;
  shares: number | null;
  comments: number | null;
}

/** Like SocialViewReader, with the engagement counts the same call returns. */
export type SocialMetricsReader = (accessToken: string, externalIds: string[]) => Promise<Map<string, PostMetrics>>;

/** A metrics reader for a network whose stats call reports views only. */
export function viewsOnlyMetrics(read: SocialViewReader): SocialMetricsReader {
  return async (accessToken, ids) => {
    const out = new Map<string, PostMetrics>();
    for (const [id, views] of await read(accessToken, ids)) out.set(id, { views, likes: null, shares: null, comments: null });
    return out;
  };
}

/** The view reader inside a metrics reader — ONE stats call serves both. */
export function viewsOf(read: SocialMetricsReader): SocialViewReader {
  return async (accessToken, ids) => {
    const out = new Map<string, number>();
    for (const [id, m] of await read(accessToken, ids)) out.set(id, m.views);
    return out;
  };
}

export type SocialPublishErrorKind =
  /** The platform rejected the token (expired / revoked / missing scope). */
  | "NOT_AUTHORIZED"
  /** The connected account can't receive this post (e.g. a personal
   *  Instagram account, a Facebook user with no Page). */
  | "ACCOUNT_UNSUPPORTED"
  /** The platform accepted the upload but processing failed. */
  | "PROCESSING_FAILED"
  /** Any other platform error. */
  | "PLATFORM_ERROR";

export class SocialPublishError extends Error {
  constructor(
    public readonly kind: SocialPublishErrorKind,
    message: string,
  ) {
    super(message);
    this.name = "SocialPublishError";
  }
}
