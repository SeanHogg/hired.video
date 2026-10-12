/**
 * Instagram — Graph API Content Publishing (Reels, pulled from our CDN URL).
 *
 *   1. GET  /me/accounts?fields=instagram_business_account{id,username}
 *        → the IG Business/Creator account linked to one of the user's Pages
 *   2. POST /{ig-user}/media  { media_type: REELS, video_url, caption }  → container
 *   3. GET  /{container}?fields=status_code   → poll until FINISHED
 *   4. POST /{ig-user}/media_publish { creation_id }                     → media id
 *   5. GET  /{media}?fields=permalink                                     → link
 *
 * Instagram only publishes for Business/Creator accounts linked to a
 * Facebook Page — a personal account fails with ACCOUNT_UNSUPPORTED and a
 * message the dock shows as-is.
 *
 * Views: `GET /{media}/insights?metric=views` (needs `instagram_manage_insights`),
 * batched through the Graph batch API.
 */
import { bearer, clip, pollUntil, readJson, sleep, type FetchLike } from "./http.js";
import { GRAPH, readLifetimeInsight } from "./meta-graph.js";
import { SocialPublishError, type SocialVideoPublisher, type SocialViewReader } from "./types.js";
import { POST_TEXT_LIMITS } from "../../../../../shared/social-platforms.js";

const CAPTION_MAX = POST_TEXT_LIMITS.instagram;

export function createInstagramPublisher(deps: { fetch?: FetchLike; wait?: (ms: number) => Promise<void> } = {}): SocialVideoPublisher {
  const http = deps.fetch ?? fetch;
  const wait = deps.wait ?? sleep;

  return {
    platform: "instagram",
    async publish({ accessToken, video, caption }) {
      const auth = bearer(accessToken);
      const json = bearer(accessToken, { "Content-Type": "application/json" });

      const pages = await readJson<{ data?: Array<{ instagram_business_account?: { id: string; username?: string } }> }>(
        await http(`${GRAPH}/me/accounts?fields=instagram_business_account%7Bid,username%7D`, { headers: auth }),
        "Instagram account lookup",
      );
      const igAccount = pages.data?.find((p) => p.instagram_business_account)?.instagram_business_account;
      if (!igAccount) {
        throw new SocialPublishError(
          "ACCOUNT_UNSUPPORTED",
          "Instagram posting needs a Business or Creator account linked to a Facebook Page.",
        );
      }

      const container = await readJson<{ id: string }>(
        await http(`${GRAPH}/${igAccount.id}/media`, {
          method: "POST",
          headers: json,
          body: JSON.stringify({
            media_type: "REELS",
            video_url: video.url,
            caption: clip(caption, CAPTION_MAX),
            share_to_feed: true,
          }),
        }),
        "Instagram upload",
      );

      const ready = await pollUntil(
        async () => {
          const status = await readJson<{ status_code?: string; status?: string }>(
            await http(`${GRAPH}/${container.id}?fields=status_code,status`, { headers: auth }),
            "Instagram processing status",
          );
          if (status.status_code === "ERROR" || status.status_code === "EXPIRED") {
            throw new SocialPublishError("PROCESSING_FAILED", `Instagram couldn't process the video: ${status.status ?? status.status_code}`);
          }
          return status.status_code === "FINISHED" ? true : null;
        },
        { intervalMs: 4000, timeoutMs: 120_000 },
        wait,
      );
      if (!ready) throw new SocialPublishError("PROCESSING_FAILED", "Instagram is still processing the video. Try posting again in a minute.");

      const published = await readJson<{ id: string }>(
        await http(`${GRAPH}/${igAccount.id}/media_publish`, {
          method: "POST",
          headers: json,
          body: JSON.stringify({ creation_id: container.id }),
        }),
        "Instagram publish",
      );

      const media = await readJson<{ permalink?: string }>(
        await http(`${GRAPH}/${published.id}?fields=permalink`, { headers: auth }),
        "Instagram permalink",
      ).catch(() => ({ permalink: undefined }));

      return { externalId: published.id, externalUrl: media.permalink ?? null };
    },
  };
}

export function createInstagramViewReader(deps: { fetch?: FetchLike } = {}): SocialViewReader {
  const http = deps.fetch ?? fetch;
  return (accessToken, mediaIds) =>
    readLifetimeInsight(http, accessToken, mediaIds, (id) => `${encodeURIComponent(id)}/insights?metric=views`, "views");
}
