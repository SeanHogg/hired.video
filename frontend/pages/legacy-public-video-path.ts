/**
 * #1218 — public watch URLs are `/m/<id>` (media). `/v/<id>` is the
 * video-era alias and permanently redirects here. App.tsx mounts the
 * watch page at `/m/:videoId` and `/v/:videoId` as LegacyPublicVideoRedirect.
 *
 * ATS packages live at `/m/ats/<slug>` (legacy `/v/ats/<slug>`).
 */

export type PublicMediaMatch =
  | { kind: "media"; id: string }
  | { kind: "ats"; slug: string };

function stripQueryAndHash(pathname: string): string {
  const q = pathname.indexOf("?");
  const h = pathname.indexOf("#");
  let end = pathname.length;
  if (q >= 0) end = Math.min(end, q);
  if (h >= 0) end = Math.min(end, h);
  return pathname.slice(0, end);
}

function decodeSegment(raw: string): string {
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

/** Parse `/m/<id>`, `/v/<id>`, `/m/ats/<slug>`, `/v/ats/<slug>`. */
export function matchPublicMediaPath(pathname: string): PublicMediaMatch | null {
  const path = stripQueryAndHash(pathname);
  const ats = path.match(/^\/(?:m|v)\/ats\/([^/]+)\/?$/);
  if (ats) return { kind: "ats", slug: decodeSegment(ats[1]) };
  const media = path.match(/^\/(?:m|v)\/([^/]+)\/?$/);
  if (media && media[1] !== "ats") {
    return { kind: "media", id: decodeSegment(media[1]) };
  }
  return null;
}

/**
 * Canonical `/m/...` destination for a legacy `/v/...` pathname.
 * Returns null when the path is already canonical or is not a watch URL.
 */
export function canonicalMediaPath(
  pathname: string,
  search = "",
  hash = "",
): string | null {
  if (!pathname.startsWith("/v/")) return null;
  const match = matchPublicMediaPath(pathname);
  if (!match) return null;
  const dest =
    match.kind === "ats"
      ? `/m/ats/${encodeURIComponent(match.slug)}`
      : `/m/${encodeURIComponent(match.id)}`;
  return `${dest}${search}${hash}`;
}

/** Watch-page id from react-router params or the pathname (NotFound fallback). */
export function publicMediaIdFrom(
  params: { videoId?: string; id?: string; mediaId?: string },
  pathname: string,
): string | undefined {
  const fromParams = params.videoId ?? params.mediaId ?? params.id;
  if (fromParams) return fromParams;
  const match = matchPublicMediaPath(pathname);
  if (match?.kind === "media") return match.id;
  return undefined;
}

export function publicAtsSlugFrom(
  params: { slug?: string },
  pathname: string,
): string | undefined {
  if (params.slug) return params.slug;
  const match = matchPublicMediaPath(pathname);
  if (match?.kind === "ats") return match.slug;
  return undefined;
}
