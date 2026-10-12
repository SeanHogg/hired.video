/**
 * OpenGraph / meta parser (pure) for feed link previews (#1968).
 *
 * Pure string work — the Worker has no DOM and pulling cheerio in for
 * one route isn't worth the bundle. Unlike a per-field regex, this walks
 * every `<meta>` tag once and reads its attributes in any order
 * (`content` before `property` is common), so one pass resolves all
 * fields.
 *
 * Precedence per field:
 *   title       og:title → twitter:title → <title>
 *   description og:description → twitter:description → meta description
 *   image       og:image(:secure_url|:url) → twitter:image(:src)
 *   siteName    og:site_name → URL hostname (www. stripped)
 *
 * Relative image URLs resolve against the page URL; anything that isn't
 * http(s) after resolution (data:, javascript:) is dropped.
 */

import { decodeHtmlEntities } from "../../../../shared/scraping/htmlUtils.js";

export interface LinkPreview {
  url: string;
  title: string | null;
  description: string | null;
  imageUrl: string | null;
  siteName: string | null;
}

const MAX_TITLE = 300;
const MAX_DESCRIPTION = 500;
const MAX_IMAGE_URL = 2048;

const META_TAG = /<meta\b[^>]*>/gi;
const ATTR = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/g;

/** Attributes of one tag, lower-cased names. */
function readAttrs(tag: string): Map<string, string> {
  const attrs = new Map<string, string>();
  for (const m of tag.matchAll(ATTR)) {
    attrs.set(m[1].toLowerCase(), m[2] ?? m[3] ?? m[4] ?? "");
  }
  return attrs;
}

/** First-wins map of meta key (property | name, lower-cased) → content. */
export function collectMeta(html: string): Map<string, string> {
  const meta = new Map<string, string>();
  for (const [tag] of html.matchAll(META_TAG)) {
    const attrs = readAttrs(tag);
    const key = (attrs.get("property") ?? attrs.get("name") ?? "").trim().toLowerCase();
    const content = attrs.get("content");
    if (!key || content === undefined || meta.has(key)) continue;
    meta.set(key, content);
  }
  return meta;
}

function clean(raw: string | undefined, max: number): string | null {
  if (!raw) return null;
  const text = decodeHtmlEntities(raw).replace(/\s+/g, " ").trim();
  if (!text) return null;
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
}

function firstOf(meta: Map<string, string>, keys: readonly string[]): string | undefined {
  for (const key of keys) {
    const value = meta.get(key);
    if (value && value.trim()) return value;
  }
  return undefined;
}

function resolveImage(raw: string | undefined, pageUrl: string): string | null {
  if (!raw) return null;
  try {
    const resolved = new URL(decodeHtmlEntities(raw.trim()), pageUrl);
    if (resolved.protocol !== "https:" && resolved.protocol !== "http:") return null;
    const href = resolved.toString();
    return href.length > MAX_IMAGE_URL ? null : href;
  } catch {
    return null;
  }
}

function hostnameOf(pageUrl: string): string | null {
  try {
    return new URL(pageUrl).hostname.replace(/^www\./, "") || null;
  } catch {
    return null;
  }
}

/** Parse a fetched HTML document into a link preview for `pageUrl`. */
export function parseLinkPreview(html: string, pageUrl: string): LinkPreview {
  // Meta tags live in <head>; cutting at </head> keeps body-embedded
  // <meta> (microdata, user content) from shadowing the real tags.
  const headEnd = html.search(/<\/head\s*>/i);
  const head = headEnd >= 0 ? html.slice(0, headEnd) : html;
  const meta = collectMeta(head);
  const docTitle = head.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1];

  return {
    url: pageUrl,
    title: clean(firstOf(meta, ["og:title", "twitter:title"]) ?? docTitle, MAX_TITLE),
    description: clean(
      firstOf(meta, ["og:description", "twitter:description", "description"]),
      MAX_DESCRIPTION,
    ),
    imageUrl: resolveImage(
      firstOf(meta, ["og:image:secure_url", "og:image", "og:image:url", "twitter:image", "twitter:image:src"]),
      pageUrl,
    ),
    siteName: clean(meta.get("og:site_name"), MAX_TITLE) ?? hostnameOf(pageUrl),
  };
}

/** The empty preview — what the composer gets when a page can't be read. */
export function emptyLinkPreview(url: string): LinkPreview {
  return { url, title: null, description: null, imageUrl: null, siteName: hostnameOf(url) };
}

/** Cache-key form of a URL: lower-cased host, no fragment, no default
 *  port, no trailing slash on the path, tracking params (utm_*, fbclid,
 *  gclid) dropped and the remaining query sorted. Null when the input
 *  isn't an absolute URL. */
export function normalizePreviewUrl(raw: string): string | null {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return null;
  }
  url.hash = "";
  url.hostname = url.hostname.toLowerCase();
  const kept = [...url.searchParams.entries()]
    .filter(([k]) => !/^utm_/i.test(k) && !/^(fbclid|gclid|mc_eid|igshid)$/i.test(k))
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  url.search = new URLSearchParams(kept).toString();
  if (url.pathname.length > 1) url.pathname = url.pathname.replace(/\/+$/, "");
  return url.toString();
}
