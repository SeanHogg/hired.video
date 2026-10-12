/**
 * #978 — TikTok Ads video upload. A TikTok ad references an uploaded
 * `video_id`, so a video creative is uploaded (by URL — TikTok fetches the
 * R2 object itself; the Worker never streams the bytes) before the ad is
 * created. The returned id is cached on the creative's metadata per
 * advertiser and reused on every later sync.
 *
 * Endpoint: POST /open_api/v1.3/file/video/ad/upload/
 *   { advertiser_id, upload_type: "UPLOAD_BY_URL", video_url, file_name }
 *   → { code: 0, data: [{ video_id, ... }] }
 * Docs: https://business-api.tiktok.com/portal/docs?id=1737587322856449
 */

import { PaidMediaAdapterError } from "../../ports/adapter.js";

export const TT_VIDEO_UPLOAD_PATH = "/file/video/ad/upload/";

/** Metadata key holding `{ [advertiserId]: videoId }`. */
const VIDEO_IDS_KEY = "tiktokVideoIds";

/** POST to a TikTok Marketing API path; returns the parsed envelope. */
export type TikTokPost = (path: string, body: unknown) => Promise<any>;

/** Cached video id for this advertiser. A manually pasted legacy
 *  `tiktokVideoId` is honoured for any advertiser. */
export function cachedTikTokVideoId(
  metadata: Record<string, unknown> | undefined,
  advertiserId: string,
): string | null {
  const byAdvertiser = metadata?.[VIDEO_IDS_KEY];
  if (byAdvertiser && typeof byAdvertiser === "object") {
    const id = (byAdvertiser as Record<string, unknown>)[advertiserId];
    if (typeof id === "string" && id) return id;
  }
  const legacy = metadata?.tiktokVideoId;
  return typeof legacy === "string" && legacy ? legacy : null;
}

/** Metadata patch that records `videoId` for `advertiserId`. */
export function tikTokVideoIdPatch(
  metadata: Record<string, unknown> | undefined,
  advertiserId: string,
  videoId: string,
): Record<string, unknown> {
  const prev = metadata?.[VIDEO_IDS_KEY];
  const map = prev && typeof prev === "object" ? (prev as Record<string, unknown>) : {};
  return { [VIDEO_IDS_KEY]: { ...map, [advertiserId]: videoId } };
}

/** Upload `videoUrl` to the advertiser's TikTok asset library. */
export async function uploadTikTokVideoByUrl(
  post: TikTokPost,
  args: { advertiserId: string; videoUrl: string; fileName: string },
): Promise<string> {
  const data = await post(TT_VIDEO_UPLOAD_PATH, {
    advertiser_id: args.advertiserId,
    upload_type: "UPLOAD_BY_URL",
    video_url: args.videoUrl,
    // TikTok rejects duplicate file names per advertiser; suffix keeps it unique.
    file_name: `${args.fileName.slice(0, 80)}-${Date.now()}`,
  });
  if (data?.code !== 0) {
    throw new PaidMediaAdapterError("tiktok", "API_ERROR", `video upload failed: ${data?.message ?? "unknown"}`, data);
  }
  const first = Array.isArray(data.data) ? data.data[0] : data.data;
  const videoId = first?.video_id;
  if (typeof videoId !== "string" || !videoId) {
    throw new PaidMediaAdapterError("tiktok", "API_ERROR", "video upload returned no video_id", data);
  }
  return videoId;
}
