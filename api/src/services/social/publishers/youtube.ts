/**
 * YouTube — Data API v3 multipart upload (push: the MP4 bytes travel in the
 * request body), behind the same port as every other network.
 *
 *   POST upload/youtube/v3/videos?uploadType=multipart&part=snippet,status
 *        multipart/related { snippet, status } + video/mp4 → { id }
 *
 * Shorts are ordinary uploads that are vertical and ≤ 3 min; YouTube files
 * them as Shorts by shape. `youtube.shorts` additionally tags the title
 * `#Shorts`, which helps YouTube surface the post in the Shorts feed.
 *
 * Views (+ likes, comments): `videos.list?part=statistics`, 50 ids per call
 * (`youtube.readonly`). YouTube reports no share count.
 */
import { buildMultipartBody } from "../../youtube/youtubeUpload.js";
import { bearer, clip, readJson, type FetchLike } from "./http.js";
import {
  SocialPublishError,
  viewsOf,
  type PostMetrics,
  type SocialMetricsReader,
  type SocialVideoPublisher,
  type SocialViewReader,
} from "./types.js";

const UPLOAD_ENDPOINT = "https://www.googleapis.com/upload/youtube/v3/videos?uploadType=multipart&part=snippet,status";
const VIDEOS_ENDPOINT = "https://www.googleapis.com/youtube/v3/videos";
const TITLE_MAX = 100;
const SHORTS_TAG = "#Shorts";
const VIEWS_BATCH = 50;

/** The title as posted: a Short carries `#Shorts` (once), within YouTube's 100 chars. */
export function youtubeTitle(title: string, shorts: boolean | undefined): string {
  const trimmed = title.trim();
  if (!shorts || /#shorts\b/i.test(trimmed)) return clip(trimmed, TITLE_MAX);
  return `${clip(trimmed, TITLE_MAX - SHORTS_TAG.length - 1)} ${SHORTS_TAG}`;
}

/** Quota / daily-upload refusals arrive as 403 but are not a bad token —
 *  reconnecting wouldn't help, so they are a platform error, not NOT_AUTHORIZED. */
const QUOTA_REASONS = new Set(["quotaExceeded", "uploadLimitExceeded", "rateLimitExceeded", "dailyLimitExceeded"]);

async function throwIfQuotaRefusal(res: Response): Promise<void> {
  if (res.status !== 403) return;
  const text = await res.clone().text();
  let reasons: string[] = [];
  try {
    const body = JSON.parse(text) as { error?: { errors?: Array<{ reason?: string }> } };
    reasons = (body.error?.errors ?? []).map((e) => e.reason ?? "");
  } catch {
    return;
  }
  if (reasons.some((r) => QUOTA_REASONS.has(r))) {
    throw new SocialPublishError("PLATFORM_ERROR", `YouTube upload refused (${reasons.join(", ")}): try again later.`);
  }
}

export function createYouTubePublisher(deps: { fetch?: FetchLike } = {}): SocialVideoPublisher {
  const http = deps.fetch ?? fetch;

  return {
    platform: "youtube",
    async publish({ accessToken, video, caption, title, youtube }) {
      const { body, contentType } = buildMultipartBody(
        {
          title: youtubeTitle(title, youtube?.shorts),
          description: caption,
          privacy: youtube?.privacy ?? "unlisted",
          tags: youtube?.tags,
        },
        await video.bytes(),
      );
      const res = await http(UPLOAD_ENDPOINT, {
        method: "POST",
        headers: bearer(accessToken, { "Content-Type": contentType }),
        body,
      });
      await throwIfQuotaRefusal(res);
      const uploaded = await readJson<{ id?: string }>(res, "YouTube upload");
      if (!uploaded.id) throw new SocialPublishError("PLATFORM_ERROR", "YouTube upload returned no video id");
      return { externalId: uploaded.id, externalUrl: `https://www.youtube.com/watch?v=${uploaded.id}` };
    },
  };
}

/** Optional numeric statistic: absent (hidden by the owner) -> null. */
function stat(v: string | undefined): number | null {
  return v === undefined ? null : Number(v);
}

export function createYouTubeMetricsReader(deps: { fetch?: FetchLike } = {}): SocialMetricsReader {
  const http = deps.fetch ?? fetch;
  return async (accessToken, ids) => {
    const metrics = new Map<string, PostMetrics>();
    for (let i = 0; i < ids.length; i += VIEWS_BATCH) {
      const batch = ids.slice(i, i + VIEWS_BATCH);
      const page = await readJson<{
        items?: Array<{ id: string; statistics?: { viewCount?: string; likeCount?: string; commentCount?: string } }>;
      }>(
        await http(`${VIDEOS_ENDPOINT}?part=statistics&id=${batch.map(encodeURIComponent).join(",")}`, {
          headers: bearer(accessToken),
        }),
        "YouTube stats",
      );
      for (const item of page.items ?? []) {
        const st = item.statistics;
        metrics.set(item.id, {
          views: Number(st?.viewCount ?? 0),
          likes: stat(st?.likeCount),
          comments: stat(st?.commentCount),
          shares: null,
        });
      }
    }
    return metrics;
  };
}

export function createYouTubeViewReader(deps: { fetch?: FetchLike } = {}): SocialViewReader {
  return viewsOf(createYouTubeMetricsReader(deps));
}
