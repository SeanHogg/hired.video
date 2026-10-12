/**
 * Facebook — Graph API video post to a Page the user manages (pulled from
 * our CDN URL; Facebook does not allow apps to post to personal profiles).
 *
 *   1. GET  /me/accounts?fields=id,name,access_token  → first Page + its Page token
 *   2. POST graph-video /{page}/videos { file_url, title, description } → video id
 *
 * Views: `GET /{video}/video_insights?metric=total_video_views` with the Page
 * token (needs `read_insights`), batched through the Graph batch API.
 */
import { bearer, clip, readJson, type FetchLike } from "./http.js";
import { GRAPH, readLifetimeInsight } from "./meta-graph.js";
import { SocialPublishError, type SocialVideoPublisher, type SocialViewReader } from "./types.js";
import { POST_TEXT_LIMITS } from "../../../../../shared/social-platforms.js";

const GRAPH_VIDEO = "https://graph-video.facebook.com/v21.0";
const TITLE_MAX = 255;
const DESCRIPTION_MAX = POST_TEXT_LIMITS.facebook;

/** The first Page the user manages, with its Page token (posts and insights both need it). */
async function managedPage(http: FetchLike, accessToken: string): Promise<{ id: string; accessToken: string }> {
  const pages = await readJson<{ data?: Array<{ id: string; access_token?: string }> }>(
    await http(`${GRAPH}/me/accounts?fields=id,name,access_token`, { headers: bearer(accessToken) }),
    "Facebook Page lookup",
  );
  const page = pages.data?.find((p) => p.access_token);
  if (!page?.access_token) {
    throw new SocialPublishError("ACCOUNT_UNSUPPORTED", "Facebook posting needs a Page you manage.");
  }
  return { id: page.id, accessToken: page.access_token };
}

export function createFacebookPublisher(deps: { fetch?: FetchLike } = {}): SocialVideoPublisher {
  const http = deps.fetch ?? fetch;

  return {
    platform: "facebook",
    async publish({ accessToken, video, caption, title }) {
      const page = await managedPage(http, accessToken);

      const form = new URLSearchParams({
        file_url: video.url,
        title: clip(title, TITLE_MAX),
        description: clip(caption || title, DESCRIPTION_MAX),
      });
      const posted = await readJson<{ id: string }>(
        await http(`${GRAPH_VIDEO}/${page.id}/videos`, {
          method: "POST",
          headers: bearer(page.accessToken, { "Content-Type": "application/x-www-form-urlencoded" }),
          body: form.toString(),
        }),
        "Facebook video post",
      );
      return { externalId: posted.id, externalUrl: `https://www.facebook.com/watch/?v=${posted.id}` };
    },
  };
}

export function createFacebookViewReader(deps: { fetch?: FetchLike } = {}): SocialViewReader {
  const http = deps.fetch ?? fetch;
  return async (accessToken, videoIds) => {
    const page = await managedPage(http, accessToken);
    return readLifetimeInsight(
      http,
      page.accessToken,
      videoIds,
      (id) => `${encodeURIComponent(id)}/video_insights?metric=total_video_views`,
      "total_video_views",
    );
  };
}
