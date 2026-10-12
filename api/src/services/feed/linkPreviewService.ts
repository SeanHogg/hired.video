/**
 * Feed link-preview service (#1968) — POST /api/feed/link-preview.
 *
 * Fetch → parse → cache, kept out of the route:
 *   • SSRF guard: reuses the image proxy's rules (utils/image-proxy.ts) —
 *     http(s) only, default ports, no credentials, no loopback / private /
 *     link-local / metadata hosts, and every redirect hop re-checked.
 *   • Bounded: FETCH_TIMEOUT_MS wall clock, and at most MAX_HTML_BYTES of
 *     the body are read (the <head> with the OG tags is at the top, so a
 *     truncated read still parses).
 *   • Cached through the canonical getOrSetCached, keyed by the
 *     normalized URL, for PREVIEW_TTL_SECONDS. Transient failures
 *     (network error, timeout, 5xx) throw so they are NOT cached; a
 *     definitive answer (non-HTML, 4xx) caches as the empty preview.
 */

import { getOrSetCached } from "../../utils/edge-cache.js";
import { fetchPublicUrl, parseProxyTarget } from "../../utils/image-proxy.js";
import {
  emptyLinkPreview,
  normalizePreviewUrl,
  parseLinkPreview,
  type LinkPreview,
} from "./ogParser.js";

export type { LinkPreview } from "./ogParser.js";

export const FETCH_TIMEOUT_MS = 5_000;
export const MAX_HTML_BYTES = 512 * 1024;
export const PREVIEW_TTL_SECONDS = 24 * 60 * 60;
const CACHE_PREFIX = "feed:link-preview:v1:";

const USER_AGENT = "Mozilla/5.0 (compatible; HiredVideoBot/1.0; +https://hired.video)";

function isHtml(contentType: string | null): boolean {
  const type = (contentType ?? "").split(";")[0].trim().toLowerCase();
  return type === "text/html" || type === "application/xhtml+xml";
}

/** Decode at most `limit` bytes of the body, then stop reading. */
async function readHead(res: Response, limit: number): Promise<string> {
  if (!res.body) return "";
  const reader = res.body.getReader();
  const decoder = new TextDecoder("utf-8");
  let text = "";
  let total = 0;
  try {
    while (total < limit) {
      const { done, value } = await reader.read();
      if (done) break;
      const room = limit - total;
      const chunk = value.byteLength > room ? value.subarray(0, room) : value;
      total += chunk.byteLength;
      text += decoder.decode(chunk, { stream: true });
    }
  } finally {
    await reader.cancel().catch(() => undefined);
  }
  return text + decoder.decode();
}

class TransientPreviewError extends Error {}

/** Fetch + parse one page. Exported for tests (inject `fetchImpl`). */
export async function scrapeLinkPreview(
  target: URL,
  fetchImpl: typeof fetch = fetch,
): Promise<LinkPreview> {
  const url = target.toString();
  let res: Response | null;
  try {
    res = await fetchPublicUrl(
      target,
      {
        headers: { "user-agent": USER_AGENT, accept: "text/html,application/xhtml+xml" },
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      },
      fetchImpl,
    );
  } catch (err) {
    throw new TransientPreviewError(`link preview fetch failed: ${String(err)}`);
  }
  // Refused redirect hop (private host / too many hops) — definitive.
  if (!res) return emptyLinkPreview(url);
  if (res.status >= 500) {
    await res.body?.cancel().catch(() => undefined);
    throw new TransientPreviewError(`link preview upstream ${res.status}`);
  }
  if (!res.ok || !isHtml(res.headers.get("content-type"))) {
    await res.body?.cancel().catch(() => undefined);
    return emptyLinkPreview(url);
  }
  const html = await readHead(res, MAX_HTML_BYTES);
  return parseLinkPreview(html, url);
}

export type LinkPreviewResult =
  | { ok: true; preview: LinkPreview }
  | { ok: false; reason: "INVALID_URL" };

/**
 * Resolve the preview for a user-pasted URL. Refused URLs (bad scheme,
 * private host, …) return INVALID_URL; transient scrape failures degrade
 * to the uncached empty preview so the composer still shows the bare link.
 */
export async function getLinkPreview(
  rawUrl: string,
  fetchImpl: typeof fetch = fetch,
): Promise<LinkPreviewResult> {
  const normalized = normalizePreviewUrl(rawUrl);
  const target = normalized ? parseProxyTarget(normalized) : null;
  if (!normalized || !target) return { ok: false, reason: "INVALID_URL" };

  try {
    const preview = await getOrSetCached<LinkPreview>({
      key: `${CACHE_PREFIX}${normalized}`,
      ttlSeconds: PREVIEW_TTL_SECONDS,
      loader: () => scrapeLinkPreview(target, fetchImpl),
    });
    return { ok: true, preview };
  } catch (err) {
    if (!(err instanceof TransientPreviewError)) {
      console.warn("[link-preview] unexpected failure", err);
    }
    return { ok: true, preview: emptyLinkPreview(normalized) };
  }
}
