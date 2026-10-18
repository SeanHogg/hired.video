/**
 * X — API v2 chunked media upload, then a post with the video attached.
 *
 *   1. POST /2/media/upload/initialize { media_type, total_bytes, media_category }
 *   2. POST /2/media/upload/{id}/append  (multipart: segment_index + media, ≤ 4 MB each)
 *   3. POST /2/media/upload/{id}/finalize → processing_info
 *   4. GET  /2/media/upload?command=STATUS&media_id={id} → poll until succeeded
 *   5. POST /2/tweets { text, media: { media_ids } }
 *
 * Needs the `media.write` + `tweet.write` scopes (platform-config.ts) and a
 * paid X API tier.
 *
 * Views: `GET /2/tweets?ids=…&tweet.fields=public_metrics` → `impression_count`
 * (the number X shows as "Views"), up to 100 ids per call.
 */
import { bearer, clip, pollUntil, readJson, sleep, type FetchLike } from "./http.js";
import {
  SocialPublishError,
  type PostMetrics,
  type SocialMetricsReader,
  type SocialVideoPublisher,
} from "./types.js";
import { POST_TEXT_LIMITS } from "../../../../../shared/social-platforms.js";

const API = "https://api.x.com/2";
const LOOKUP_MAX = 100;
const SEGMENT_SIZE = 4 * 1024 * 1024;
const TEXT_MAX = POST_TEXT_LIMITS.x;

interface ProcessingInfo {
  state?: "pending" | "in_progress" | "succeeded" | "failed";
  check_after_secs?: number;
  error?: { message?: string };
}

export function createXPublisher(deps: { fetch?: FetchLike; wait?: (ms: number) => Promise<void> } = {}): SocialVideoPublisher {
  const http = deps.fetch ?? fetch;
  const wait = deps.wait ?? sleep;

  return {
    platform: "x",
    async publish({ accessToken, video, caption, title }) {
      const auth = bearer(accessToken);
      const json = bearer(accessToken, { "Content-Type": "application/json" });
      const bytes = await video.bytes();

      const init = await readJson<{ data?: { id: string } }>(
        await http(`${API}/media/upload/initialize`, {
          method: "POST",
          headers: json,
          body: JSON.stringify({ media_type: "video/mp4", total_bytes: bytes.byteLength, media_category: "tweet_video" }),
        }),
        "X upload init",
      );
      const mediaId = init.data?.id;
      if (!mediaId) throw new SocialPublishError("PLATFORM_ERROR", "X upload init returned no media id");

      for (let index = 0, start = 0; start < bytes.byteLength; index++, start += SEGMENT_SIZE) {
        const form = new FormData();
        form.append("segment_index", String(index));
        form.append("media", new Blob([bytes.slice(start, start + SEGMENT_SIZE)], { type: "video/mp4" }));
        const res = await http(`${API}/media/upload/${mediaId}/append`, { method: "POST", headers: auth, body: form });
        if (!res.ok) {
          throw new SocialPublishError(
            res.status === 401 || res.status === 403 ? "NOT_AUTHORIZED" : "PLATFORM_ERROR",
            `X upload segment ${index} failed (${res.status})`,
          );
        }
      }

      const finalized = await readJson<{ data?: { processing_info?: ProcessingInfo } }>(
        await http(`${API}/media/upload/${mediaId}/finalize`, { method: "POST", headers: auth }),
        "X upload finalize",
      );

      if (finalized.data?.processing_info) {
        const done = await pollUntil(
          async () => {
            const status = await readJson<{ data?: { processing_info?: ProcessingInfo } }>(
              await http(`${API}/media/upload?command=STATUS&media_id=${encodeURIComponent(mediaId)}`, { headers: auth }),
              "X processing status",
            );
            const info = status.data?.processing_info;
            if (info?.state === "failed") {
              throw new SocialPublishError("PROCESSING_FAILED", `X couldn't process the video: ${info.error?.message ?? "unknown"}`);
            }
            return !info || info.state === "succeeded" ? true : null;
          },
          { intervalMs: 3000, timeoutMs: 90_000 },
          wait,
        );
        if (!done) throw new SocialPublishError("PROCESSING_FAILED", "X is still processing the video. Try posting again in a minute.");
      }

      const tweet = await readJson<{ data?: { id: string } }>(
        await http(`${API}/tweets`, {
          method: "POST",
          headers: json,
          body: JSON.stringify({ text: clip(caption || title, TEXT_MAX), media: { media_ids: [mediaId] } }),
        }),
        "X post",
      );
      const id = tweet.data?.id;
      if (!id) throw new SocialPublishError("PLATFORM_ERROR", "X returned no post id");
      return { externalId: id, externalUrl: `https://x.com/i/web/status/${id}` };
    },
  };
}

interface XPublicMetrics {
  impression_count?: number;
  like_count?: number;
  reply_count?: number;
  retweet_count?: number;
  quote_count?: number;
}

const num = (v: number | undefined): number | null => (typeof v === "number" ? v : null);

export function createXMetricsReader(deps: { fetch?: FetchLike } = {}): SocialMetricsReader {
  const http = deps.fetch ?? fetch;
  return async (accessToken, postIds) => {
    const metrics = new Map<string, PostMetrics>();
    for (let i = 0; i < postIds.length; i += LOOKUP_MAX) {
      const ids = postIds.slice(i, i + LOOKUP_MAX).map(encodeURIComponent).join(",");
      // Deleted posts come back under `errors`; the rest still answer in `data`.
      const body = await readJson<{ data?: Array<{ id: string; public_metrics?: XPublicMetrics }> }>(
        await http(`${API}/tweets?ids=${ids}&tweet.fields=public_metrics`, { headers: bearer(accessToken) }),
        "X post metrics",
      );
      for (const post of body.data ?? []) {
        const m = post.public_metrics;
        if (typeof m?.impression_count !== "number") continue;
        // A share on X is a repost or a quote.
        const reposts = num(m.retweet_count);
        const quotes = num(m.quote_count);
        metrics.set(post.id, {
          views: m.impression_count,
          likes: num(m.like_count),
          comments: num(m.reply_count),
          shares: reposts === null && quotes === null ? null : (reposts ?? 0) + (quotes ?? 0),
        });
      }
    }
    return metrics;
  };
}
