/**
 * TikTok — Content Posting API, Direct Post (FILE_UPLOAD).
 *
 *   1. POST /v2/post/publish/creator_info/query/  → allowed privacy levels + username
 *   2. POST /v2/post/publish/video/init/          → publish_id + upload_url
 *   3. PUT  upload_url (Content-Range chunks)     → bytes land on TikTok
 *   4. POST /v2/post/publish/status/fetch/        → poll until PUBLISH_COMPLETE
 *
 * Settings: a user's own post carries the choices they made in the Post dock
 * (`req.tiktok` — privacy, interactions, disclosure; TikTok's sharing
 * guidelines forbid defaulting them). Without settings (hired.video's own
 * brand account) the post uses PUBLIC_TO_EVERYONE when allowed, else the
 * first option. Until the developer app passes TikTok's audit, TikTok only
 * offers SELF_ONLY — posts land private (platform rule).
 *
 * Chunking (TikTok rule): files ≤ 64 MB go up in one chunk; larger files use
 * 10 MB chunks with the remainder folded into the last one.
 *
 * Views: `POST /v2/video/query/?fields=id,view_count` (needs `video.list`),
 * up to 20 ids per call. Only finished posts have a numeric video id — a
 * publish that timed out kept its publish id, which TikTok can't query.
 */
import { bearer, clip, pollUntil, readJson, sleep, type FetchLike } from "./http.js";
import {
  SocialPublishError,
  type PostMetrics,
  type SocialMetricsReader,
  type SocialVideoPublisher,
} from "./types.js";
import {
  tiktokSettingsProblem,
  type TikTokCreatorInfo,
  type TikTokPostSettings,
} from "../../../../../shared/tiktok-post-settings.js";
import { POST_TEXT_LIMITS } from "../../../../../shared/social-platforms.js";

const API = "https://open.tiktokapis.com/v2/post/publish";
const TITLE_MAX = POST_TEXT_LIMITS.tiktok;
const SINGLE_CHUNK_MAX = 64 * 1024 * 1024;
const CHUNK_SIZE = 10 * 1024 * 1024;
const VIDEO_QUERY = "https://open.tiktokapis.com/v2/video/query/?fields=id,view_count,like_count,comment_count,share_count";
const VIDEO_QUERY_MAX = 20;
const VIDEO_ID = /^\d+$/;

interface TikTokEnvelope<T> {
  data?: T;
  error?: { code?: string; message?: string };
}

function unwrap<T>(body: TikTokEnvelope<T>, label: string): T {
  const code = body.error?.code;
  if (code && code !== "ok") {
    const kind = code.startsWith("access_token") || code === "scope_not_authorized" ? "NOT_AUTHORIZED" : "PLATFORM_ERROR";
    throw new SocialPublishError(kind, `${label}: ${code} ${body.error?.message ?? ""}`.trim());
  }
  if (!body.data) throw new SocialPublishError("PLATFORM_ERROR", `${label}: empty response`);
  return body.data;
}

/** TikTok's chunk plan for a file of `size` bytes. */
export function tiktokChunkPlan(size: number): { chunkSize: number; count: number } {
  if (size <= SINGLE_CHUNK_MAX) return { chunkSize: size, count: 1 };
  return { chunkSize: CHUNK_SIZE, count: Math.floor(size / CHUNK_SIZE) };
}

interface RawCreatorInfo {
  creator_nickname?: string;
  creator_username?: string;
  creator_avatar_url?: string;
  privacy_level_options?: string[];
  comment_disabled?: boolean;
  duet_disabled?: boolean;
  stitch_disabled?: boolean;
  max_video_post_duration_sec?: number;
}

/** The creator's current posting state. TikTok requires reading it fresh each
 *  time the post form renders (no caching — limits and options change). */
export async function queryTikTokCreatorInfo(accessToken: string, http: FetchLike = fetch): Promise<TikTokCreatorInfo> {
  const raw = unwrap(
    await readJson<TikTokEnvelope<RawCreatorInfo>>(
      await http(`${API}/creator_info/query/`, {
        method: "POST",
        headers: bearer(accessToken, { "Content-Type": "application/json; charset=UTF-8" }),
      }),
      "TikTok creator info",
    ),
    "TikTok creator info",
  );
  return {
    nickname: raw.creator_nickname || raw.creator_username || "",
    username: raw.creator_username ?? null,
    avatarUrl: raw.creator_avatar_url ?? null,
    privacyLevelOptions: raw.privacy_level_options ?? [],
    commentDisabled: !!raw.comment_disabled,
    duetDisabled: !!raw.duet_disabled,
    stitchDisabled: !!raw.stitch_disabled,
    maxVideoPostDurationSec: raw.max_video_post_duration_sec ?? null,
  };
}

/** TikTok's `post_info` for the creator's settings (or the brand-account fallback). */
function postInfo(creator: TikTokCreatorInfo, settings: TikTokPostSettings | undefined, title: string) {
  if (!settings) {
    const options = creator.privacyLevelOptions;
    const privacy = options.includes("PUBLIC_TO_EVERYONE") ? "PUBLIC_TO_EVERYONE" : options[0];
    if (!privacy) throw new SocialPublishError("ACCOUNT_UNSUPPORTED", "TikTok offered no privacy level for this account");
    return { title, privacy_level: privacy };
  }
  const problem = tiktokSettingsProblem(settings, creator.privacyLevelOptions);
  if (problem) throw new SocialPublishError("ACCOUNT_UNSUPPORTED", `TikTok post settings are incomplete (${problem})`);
  return {
    title,
    privacy_level: settings.privacyLevel,
    disable_comment: creator.commentDisabled || !settings.allowComment,
    disable_duet: creator.duetDisabled || !settings.allowDuet,
    disable_stitch: creator.stitchDisabled || !settings.allowStitch,
    brand_organic_toggle: settings.discloseContent && settings.yourBrand,
    brand_content_toggle: settings.discloseContent && settings.brandedContent,
  };
}

export function createTikTokPublisher(deps: { fetch?: FetchLike; wait?: (ms: number) => Promise<void> } = {}): SocialVideoPublisher {
  const http = deps.fetch ?? fetch;
  const wait = deps.wait ?? sleep;
  const json = (token: string) => bearer(token, { "Content-Type": "application/json; charset=UTF-8" });

  return {
    platform: "tiktok",
    async publish({ accessToken, video, caption, title, tiktok }) {
      const creator = await queryTikTokCreatorInfo(accessToken, http);
      const info = postInfo(creator, tiktok, clip(caption || title, TITLE_MAX));

      const bytes = await video.bytes();
      const plan = tiktokChunkPlan(bytes.byteLength);
      const init = unwrap(
        await readJson<TikTokEnvelope<{ publish_id: string; upload_url: string }>>(
          await http(`${API}/video/init/`, {
            method: "POST",
            headers: json(accessToken),
            body: JSON.stringify({
              post_info: info,
              source_info: {
                source: "FILE_UPLOAD",
                video_size: bytes.byteLength,
                chunk_size: plan.chunkSize,
                total_chunk_count: plan.count,
              },
            }),
          }),
          "TikTok init",
        ),
        "TikTok init",
      );

      for (let i = 0; i < plan.count; i++) {
        const start = i * plan.chunkSize;
        const end = i === plan.count - 1 ? bytes.byteLength : start + plan.chunkSize;
        const res = await http(init.upload_url, {
          method: "PUT",
          headers: {
            "Content-Type": "video/mp4",
            "Content-Range": `bytes ${start}-${end - 1}/${bytes.byteLength}`,
          },
          body: bytes.slice(start, end),
        });
        if (!res.ok) {
          throw new SocialPublishError("PLATFORM_ERROR", `TikTok upload chunk ${i + 1}/${plan.count} failed (${res.status})`);
        }
      }

      // Publishing finishes asynchronously; wait briefly for the post id so
      // the share link points at the post, else keep the publish id.
      const postId = await pollUntil(
        async () => {
          const status = unwrap(
            await readJson<TikTokEnvelope<{ status?: string; fail_reason?: string; publicaly_available_post_id?: Array<string | number> }>>(
              await http(`${API}/status/fetch/`, {
                method: "POST",
                headers: json(accessToken),
                body: JSON.stringify({ publish_id: init.publish_id }),
              }),
              "TikTok status",
            ),
            "TikTok status",
          );
          if (status.status === "FAILED") {
            throw new SocialPublishError("PROCESSING_FAILED", `TikTok rejected the video: ${status.fail_reason ?? "unknown"}`);
          }
          if (status.status === "PUBLISH_COMPLETE") return String(status.publicaly_available_post_id?.[0] ?? "");
          return null;
        },
        { intervalMs: 3000, timeoutMs: 45_000 },
        wait,
      );

      const username = creator.username;
      return postId && username
        ? { externalId: postId, externalUrl: `https://www.tiktok.com/@${username}/video/${postId}` }
        : { externalId: init.publish_id, externalUrl: username ? `https://www.tiktok.com/@${username}` : null };
    },
  };
}

interface TikTokVideoStats {
  id: string | number;
  view_count?: number;
  like_count?: number;
  comment_count?: number;
  share_count?: number;
}

const optionalCount = (v: number | undefined): number | null => (typeof v === "number" ? v : null);

export function createTikTokMetricsReader(deps: { fetch?: FetchLike } = {}): SocialMetricsReader {
  const http = deps.fetch ?? fetch;
  return async (accessToken, externalIds) => {
    const videoIds = externalIds.filter((id) => VIDEO_ID.test(id));
    const metrics = new Map<string, PostMetrics>();
    for (let i = 0; i < videoIds.length; i += VIDEO_QUERY_MAX) {
      const data = unwrap(
        await readJson<TikTokEnvelope<{ videos?: TikTokVideoStats[] }>>(
          await http(VIDEO_QUERY, {
            method: "POST",
            headers: bearer(accessToken, { "Content-Type": "application/json; charset=UTF-8" }),
            body: JSON.stringify({ filters: { video_ids: videoIds.slice(i, i + VIDEO_QUERY_MAX) } }),
          }),
          "TikTok video query",
        ),
        "TikTok video query",
      );
      for (const video of data.videos ?? []) {
        if (typeof video.view_count !== "number") continue;
        metrics.set(String(video.id), {
          views: video.view_count,
          likes: optionalCount(video.like_count),
          comments: optionalCount(video.comment_count),
          shares: optionalCount(video.share_count),
        });
      }
    }
    return metrics;
  };
}
