/**
 * LinkedIn — member video post through the versioned REST API. The whole
 * sequence runs server-side so the member's token never reaches the browser
 * (#2313):
 *
 *   1. GET  /v2/userinfo                     → the member id (`sub`) = post author
 *   2. POST /rest/videos?action=initializeUpload → upload parts + video URN + upload token
 *   3. PUT  each byte range to its pre-signed upload URL (no auth), collecting ETags
 *   4. POST /rest/videos?action=finalizeUpload   → with the ETags, in part order
 *   5. POST /rest/posts                       → the member post referencing the video
 *
 * Needs `openid profile w_member_social` (platform-config.ts, self lane). The
 * managed lane (a Company Page) posts as an organization URN, which this
 * adapter does not resolve — LinkedIn is therefore not a promotion platform
 * (shared/promotions.ts).
 *
 * Views: `GET /rest/memberCreatorPostAnalytics?q=entity&queryType=IMPRESSION`
 * per post. It needs `r_member_postAnalytics` (Community Management API),
 * which the self lane doesn't request today, so nothing reads it yet; the
 * reader exists to keep the adapter complete behind the port.
 */
import { LINKEDIN_POST_TEXT_MAX } from "../../../../../shared/social-platforms.js";
import { linkedInApiVersion } from "../../../utils/linkedin-version.js";
import { bearer, clip, readJson, type FetchLike } from "./http.js";
import { SocialPublishError, type SocialVideoPublisher, type SocialViewReader } from "./types.js";

const REST = "https://api.linkedin.com/rest";
const USERINFO = "https://api.linkedin.com/v2/userinfo";

function restHeaders(accessToken: string): Record<string, string> {
  return bearer(accessToken, {
    "LinkedIn-Version": linkedInApiVersion(),
    "X-Restli-Protocol-Version": "2.0.0",
    "Content-Type": "application/json",
  });
}

/** LinkedIn "little text" treats these characters as markup; unescaped they
 *  make the post fail or drop text. `#` stays literal so hashtags work. */
export function escapeLinkedInCommentary(text: string): string {
  return text.replace(/[\\|{}@[\]()<>*_~]/g, (ch) => `\\${ch}`);
}

/** Public link to a post from its URN (`urn:li:share:…` / `urn:li:ugcPost:…`). */
export function linkedInPostUrl(postUrn: string): string {
  return `https://www.linkedin.com/feed/update/${postUrn}`;
}

/** Non-2xx with no body to parse (upload PUT, finalize, post) → typed error. */
async function expectOk(res: Response, label: string): Promise<void> {
  if (res.ok) return;
  const body = await res.text().catch(() => "");
  const kind = res.status === 401 || res.status === 403 ? "NOT_AUTHORIZED" : "PLATFORM_ERROR";
  throw new SocialPublishError(kind, `${label} failed (${res.status}): ${body.slice(0, 300)}`);
}

interface InitializeUploadResponse {
  value?: {
    video?: string;
    uploadToken?: string;
    uploadInstructions?: Array<{ uploadUrl: string; firstByte: number; lastByte: number }>;
  };
}

export function createLinkedInPublisher(deps: { fetch?: FetchLike } = {}): SocialVideoPublisher {
  const http = deps.fetch ?? fetch;

  return {
    platform: "linkedin",
    async publish({ accessToken, video, caption, title }) {
      const me = await readJson<{ sub?: string }>(await http(USERINFO, { headers: bearer(accessToken) }), "LinkedIn profile");
      if (!me.sub) throw new SocialPublishError("ACCOUNT_UNSUPPORTED", "LinkedIn returned no member id for this account");
      const owner = `urn:li:person:${me.sub}`;
      const bytes = await video.bytes();

      const init = await readJson<InitializeUploadResponse>(
        await http(`${REST}/videos?action=initializeUpload`, {
          method: "POST",
          headers: restHeaders(accessToken),
          body: JSON.stringify({
            initializeUploadRequest: { owner, fileSizeBytes: bytes.byteLength, uploadCaptions: false, uploadThumbnail: false },
          }),
        }),
        "LinkedIn upload init",
      );
      const videoUrn = init.value?.video;
      const parts = init.value?.uploadInstructions ?? [];
      if (!videoUrn || parts.length === 0) {
        throw new SocialPublishError("PLATFORM_ERROR", "LinkedIn returned no upload instructions");
      }

      // Pre-signed URLs: the member token must NOT ride along.
      const partIds: string[] = [];
      for (const part of parts) {
        const res = await http(part.uploadUrl, {
          method: "PUT",
          headers: { "Content-Type": "application/octet-stream" },
          body: bytes.slice(part.firstByte, part.lastByte + 1),
        });
        await expectOk(res, "LinkedIn upload");
        const etag = res.headers.get("etag");
        if (!etag) throw new SocialPublishError("PLATFORM_ERROR", "LinkedIn upload returned no ETag");
        partIds.push(etag);
      }

      const finalized = await http(`${REST}/videos?action=finalizeUpload`, {
        method: "POST",
        headers: restHeaders(accessToken),
        body: JSON.stringify({
          finalizeUploadRequest: { video: videoUrn, uploadToken: init.value?.uploadToken ?? "", uploadedPartIds: partIds },
        }),
      });
      await expectOk(finalized, "LinkedIn upload finalize");

      const post = await http(`${REST}/posts`, {
        method: "POST",
        headers: restHeaders(accessToken),
        body: JSON.stringify({
          author: owner,
          commentary: escapeLinkedInCommentary(clip(caption || title, LINKEDIN_POST_TEXT_MAX)),
          visibility: "PUBLIC",
          distribution: { feedDistribution: "MAIN_FEED", targetEntities: [], thirdPartyDistributionChannels: [] },
          content: { media: { id: videoUrn, ...(title ? { title } : {}) } },
          lifecycleState: "PUBLISHED",
          isReshareDisabledByAuthor: false,
        }),
      });
      await expectOk(post, "LinkedIn post");
      const postUrn = post.headers.get("x-restli-id");
      if (!postUrn) throw new SocialPublishError("PLATFORM_ERROR", "LinkedIn returned no post id");
      return { externalId: postUrn, externalUrl: linkedInPostUrl(postUrn) };
    },
  };
}

/** Rest.li entity key for a post URN: `(share:urn…)` or `(ugc:urn…)`. */
function analyticsEntity(postUrn: string): string {
  const kind = postUrn.startsWith("urn:li:ugcPost:") ? "ugc" : "share";
  return `(${kind}:${encodeURIComponent(postUrn)})`;
}

export function createLinkedInViewReader(deps: { fetch?: FetchLike } = {}): SocialViewReader {
  const http = deps.fetch ?? fetch;
  return async (accessToken, postUrns) => {
    const views = new Map<string, number>();
    for (const urn of postUrns) {
      const res = await http(
        `${REST}/memberCreatorPostAnalytics?q=entity&entity=${analyticsEntity(urn)}&queryType=IMPRESSION&aggregation=TOTAL`,
        { headers: restHeaders(accessToken) },
      );
      // A deleted post answers 404 — leave it out (unknown, not zero).
      if (res.status === 404) continue;
      const body = await readJson<{ elements?: Array<{ count?: number }> }>(res, "LinkedIn post analytics");
      const count = body.elements?.[0]?.count;
      if (typeof count === "number") views.set(urn, count);
    }
    return views;
  };
}
