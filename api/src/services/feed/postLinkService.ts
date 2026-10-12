/**
 * Feed post link fields (#1968) — resolves the link card a post stores.
 *
 * The composer previews the first URL in the text via POST
 * /api/feed/link-preview and sends ONLY that URL as `linkUrl` on create.
 * The title / description / image are never taken from the client: they
 * are resolved here through the same cached, SSRF-guarded
 * `getLinkPreview` and persisted on the row (feed_posts.link_* columns),
 * so the feed read path stays one query with no per-post unfurl.
 *
 * Latency guard: the composer has just warmed the preview cache for this
 * URL, so the normal case is a cache hit. A cold miss is capped at
 * `POST_LINK_RESOLVE_TIMEOUT_MS`; past that the post is created with the
 * bare URL (the card falls back to it) and the in-flight scrape is handed
 * to `waitUntil` so it still fills the cache.
 */

import { parseProxyTarget } from "../../utils/image-proxy.js";
import { getLinkPreview, type LinkPreview } from "./linkPreviewService.js";
import { normalizePreviewUrl } from "./ogParser.js";

export const POST_LINK_RESOLVE_TIMEOUT_MS = 1_500;

/** feed_posts column limits (api/src/db/schema/feed.ts). */
const MAX_LINK_URL = 2000;
const MAX_LINK_TITLE = 500;
const MAX_LINK_IMAGE_URL = 2000;

export interface PostLinkFields {
  linkUrl: string | null;
  linkTitle: string | null;
  linkDescription: string | null;
  linkImageUrl: string | null;
}

export interface ResolvePostLinkOptions {
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
  /** Keeps a timed-out scrape alive so it still populates the cache. */
  waitUntil?: (promise: Promise<unknown>) => void;
}

export const NO_POST_LINK: PostLinkFields = {
  linkUrl: null,
  linkTitle: null,
  linkDescription: null,
  linkImageUrl: null,
};

/** Map a resolved preview onto the columns, dropping over-long values. */
export function toPostLinkFields(preview: LinkPreview): PostLinkFields {
  if (preview.url.length > MAX_LINK_URL) return NO_POST_LINK;
  return {
    linkUrl: preview.url,
    linkTitle: preview.title ? preview.title.slice(0, MAX_LINK_TITLE) : null,
    linkDescription: preview.description,
    linkImageUrl:
      preview.imageUrl && preview.imageUrl.length <= MAX_LINK_IMAGE_URL ? preview.imageUrl : null,
  };
}

/**
 * Resolve the link columns for a new post from the client-sent `linkUrl`.
 * Anything that isn't a public http(s) URL (getLinkPreview's SSRF rules)
 * stores no link at all, so an unsafe href never reaches the card.
 */
export async function resolvePostLinkFields(
  rawUrl: unknown,
  options: ResolvePostLinkOptions = {},
): Promise<PostLinkFields> {
  if (typeof rawUrl !== "string") return NO_POST_LINK;
  const normalized = normalizePreviewUrl(rawUrl);
  if (!normalized || normalized.length > MAX_LINK_URL || !parseProxyTarget(normalized)) {
    return NO_POST_LINK;
  }

  const { timeoutMs = POST_LINK_RESOLVE_TIMEOUT_MS, fetchImpl, waitUntil } = options;
  const lookup = getLinkPreview(normalized, fetchImpl);
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timedOut = new Promise<"timeout">((resolve) => {
    timer = setTimeout(() => resolve("timeout"), timeoutMs);
  });

  try {
    const result = await Promise.race([lookup, timedOut]);
    if (result === "timeout") {
      try {
        waitUntil?.(lookup);
      } catch {
        // No execution context (tests / non-Worker runtime) — the lookup
        // still settles on its own.
      }
      return { ...NO_POST_LINK, linkUrl: normalized };
    }
    return result.ok ? toPostLinkFields(result.preview) : NO_POST_LINK;
  } finally {
    clearTimeout(timer);
  }
}
