// Single source of truth for parsing YouTube URLs into video IDs and
// thumbnail / embed URLs. Pre-existing duplicates live in MediaCard.tsx,
// MetaBadge.tsx, MediaModal.tsx, ResumeViewer.tsx, ResumeDetail.tsx, and
// ToolPromoVideo.tsx — see Consolidated Gap Register for the consolidation
// follow-up. New call sites must consume these helpers, not re-roll URL
// parsing inline.

export function getYouTubeVideoId(url: string): string | null {
  try {
    const u = new URL(url);
    if (u.hostname.includes("youtu.be")) {
      const id = u.pathname.split("/").filter(Boolean)[0];
      return id || null;
    }
    if (u.hostname.includes("youtube.com")) {
      const v = u.searchParams.get("v");
      if (v) return v;
      const parts = u.pathname.split("/").filter(Boolean);
      const embedIdx = parts.indexOf("embed");
      if (embedIdx >= 0 && parts[embedIdx + 1]) return parts[embedIdx + 1];
    }
  } catch {
    // not a parseable URL — caller falls back to the original href
  }
  return null;
}

/** mqdefault is always present for any public video; maxresdefault may 404. */
export function getYouTubeThumbnail(url: string, quality: "mq" | "max" = "mq"): string | null {
  const id = getYouTubeVideoId(url);
  if (!id) return null;
  return `https://img.youtube.com/vi/${id}/${quality}default.jpg`;
}

export function getYouTubeEmbedUrl(url: string, autoplay = false): string {
  const id = getYouTubeVideoId(url);
  if (!id) return url;
  return `https://www.youtube.com/embed/${id}${autoplay ? "?autoplay=1" : ""}`;
}
