/**
 * Manual-upload fallback (#2048, PRD §5.0 / §7): where hired.video can't post
 * for the creator — a network whose developer app isn't live yet, or one
 * that forbids direct publishing (Webtoon, Tapas: the `webtoon-feed` /
 * `tapas-feed` destinations) — the creator downloads the file, uploads it
 * themselves, then pastes the post's link ("Mark as posted"). That link is
 * recorded as an ordinary publication, so the post shows in "Published to"
 * and, where the network lets us read stats by the id in the link, gets
 * off-platform metrics like any other post.
 *
 * Framework-free; the API validates with the same parser the card uses.
 */
import { isVideoPublishPlatform } from "./social-platforms.js";

export const MANUAL_UPLOAD_DESTINATIONS = [
  "youtube",
  "tiktok",
  "instagram",
  "x",
  "facebook",
  "linkedin",
  "webtoon-feed",
  "tapas-feed",
] as const;
export type ManualUploadDestination = (typeof MANUAL_UPLOAD_DESTINATIONS)[number];

export function isManualUploadDestination(v: string): v is ManualUploadDestination {
  return (MANUAL_UPLOAD_DESTINATIONS as readonly string[]).includes(v);
}

interface ManualUploadGuide {
  /** Where the creator uploads it. */
  uploadUrl: string;
  /** Hosts a link to the posted item may be on. */
  hosts: readonly string[];
  /** The network's post id in a link, when its stats API can read that id. */
  postId: (url: URL) => string | null;
}

const lastPathMatch = (url: URL, re: RegExp): string | null => url.pathname.match(re)?.[1] ?? null;

const GUIDES: Record<ManualUploadDestination, ManualUploadGuide> = {
  youtube: {
    uploadUrl: "https://studio.youtube.com/",
    hosts: ["youtube.com", "youtu.be", "m.youtube.com"],
    postId: (u) =>
      (u.hostname.endsWith("youtu.be") ? lastPathMatch(u, /^\/([\w-]{6,20})$/) : null) ??
      u.searchParams.get("v") ??
      lastPathMatch(u, /^\/shorts\/([\w-]{6,20})/),
  },
  tiktok: {
    uploadUrl: "https://www.tiktok.com/upload",
    hosts: ["tiktok.com"],
    postId: (u) => lastPathMatch(u, /\/video\/(\d{6,25})/),
  },
  instagram: {
    uploadUrl: "https://www.instagram.com/",
    hosts: ["instagram.com"],
    // A link carries a shortcode, not the media id the insights API reads.
    postId: () => null,
  },
  x: {
    uploadUrl: "https://x.com/compose/post",
    hosts: ["x.com", "twitter.com"],
    postId: (u) => lastPathMatch(u, /\/status\/(\d{6,25})/),
  },
  facebook: {
    uploadUrl: "https://www.facebook.com/",
    hosts: ["facebook.com", "fb.watch"],
    postId: (u) => lastPathMatch(u, /\/(?:videos|reel)\/(\d{6,25})/) ?? u.searchParams.get("v"),
  },
  linkedin: {
    uploadUrl: "https://www.linkedin.com/feed/",
    hosts: ["linkedin.com"],
    postId: (u) => decodeURIComponent(u.pathname).match(/(urn:li:(?:share|ugcPost):\d{6,25})/)?.[1] ?? null,
  },
  "webtoon-feed": {
    uploadUrl: "https://www.webtoons.com/en/creators101/webtoon",
    hosts: ["webtoons.com"],
    postId: () => null,
  },
  "tapas-feed": {
    uploadUrl: "https://tapas.io/create",
    hosts: ["tapas.io"],
    postId: () => null,
  },
};

export function manualUploadUrl(destination: ManualUploadDestination): string {
  return GUIDES[destination].uploadUrl;
}

/** Whether a link to a post on this destination can be read for metrics. */
export function manualPostTracksMetrics(destination: ManualUploadDestination): boolean {
  return isVideoPublishPlatform(destination) && destination !== "instagram";
}

export interface ManualPost {
  externalUrl: string;
  /** The network's post id when its stats can be read by it; else null. */
  externalId: string | null;
}

/** The pasted link as a post on `destination`, or null when it isn't one
 *  (not https, or not that network's site). */
export function parseManualPostUrl(destination: ManualUploadDestination, raw: string): ManualPost | null {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return null;
  }
  if (url.protocol !== "https:") return null;
  const host = url.hostname.toLowerCase().replace(/^www\./, "");
  const guide = GUIDES[destination];
  if (!guide.hosts.some((h) => host === h || host.endsWith(`.${h}`))) return null;
  const id = guide.postId(url);
  return { externalUrl: url.toString(), externalId: id && /^[\w:.-]{1,200}$/.test(id) ? id : null };
}
