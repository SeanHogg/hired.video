/**
 * Podcast RSS 2.0 feed XML generator — closes the in-tree half of
 * #908 (RSS / Apple Podcasts / Spotify publish). Apple Podcasts +
 * Spotify both subscribe to the same RSS 2.0 + iTunes namespace; once
 * the feed URL is registered with each platform, new episodes
 * propagate automatically.
 *
 * Scope (this pass):
 *   - Pure function that takes a `PodcastFeedSpec` + an `episodes[]`
 *     array and emits the RSS 2.0 XML string.
 *   - Standard iTunes-namespace tags (itunes:author, itunes:image,
 *     itunes:category, itunes:explicit, itunes:duration, itunes:season,
 *     itunes:episode).
 *   - Per-episode <enclosure> for the MP3 URL.
 *   - Chapter markers via the Podcast 2.0 chapters spec
 *     (https://podcastindex.org/namespace/1.0) — same data the in-tree
 *     ID3 chapter writer (#907) uses.
 *
 * Deferred (when the publish pipeline matures):
 *   - Hosting the feed URL (needs a server route + R2-backed feed
 *     storage). The encoder lives in `shared/` so both frontend (live
 *     preview) and backend (route handler) consume it.
 *   - Apple Podcasts Connect / Spotify for Creators OAuth — adapters
 *     that POST the feed URL to each platform. Credentials-blocked
 *     work tracked separately on #1008's sibling for podcasts.
 *
 * Per the project's DRY rule, this is the SINGLE encoder used by both
 * an "RSS feed preview" UI button (download the XML) AND a future
 * server worker that publishes the feed at `/feed/:projectId.xml`.
 */

import { formatDuration } from "./duration-format.js";

export interface PodcastFeedSpec {
  /** Show title — surfaced as the podcast name on Apple / Spotify. */
  title: string;
  /** One-paragraph show description. */
  description: string;
  /** Public canonical URL of the show's home page. */
  link: string;
  /** Public URL of the show's 3000×3000 cover art (Apple Podcasts
   *  recommended). PNG or JPEG. */
  imageUrl: string;
  /** Show author / host name. */
  author: string;
  /** Show owner contact email — required by Apple Podcasts to
   *  approve the feed. */
  ownerEmail: string;
  /** Show owner display name — defaults to `author` when omitted. */
  ownerName?: string;
  /** iTunes top-level category (e.g. "Business", "Technology",
   *  "Education"). Apple's directory uses these for browse filtering. */
  category: string;
  /** Optional subcategory under `category`. */
  subcategory?: string;
  /** Show language as an RFC-5646 tag (e.g. "en-us"). */
  language: string;
  /** `explicit` flag — Apple Podcasts gates listing under
   *  parental-control with this. */
  explicit: boolean;
  /** Copyright line — surfaced in the directory under the show. */
  copyright?: string;
  /** Feed URL — where this XML is hosted. Used for `<atom:link
   *  rel="self">` per RSS 2.0 best practice. */
  feedUrl: string;
}

export interface PodcastEpisode {
  /** Stable GUID — must be globally unique + permanent. Apple uses
   *  this as the dedup key. Project id + episode id works. */
  guid: string;
  /** Episode title. */
  title: string;
  /** Episode summary — usually a few sentences. */
  description: string;
  /** Public CDN URL of the rendered MP3 / M4A. */
  audioUrl: string;
  /** Audio file size in bytes. Apple requires this for accurate
   *  download-progress UI. */
  audioBytes: number;
  /** Audio mime — `audio/mpeg` for MP3, `audio/x-m4a` for M4A. */
  audioMime: string;
  /** Episode duration in seconds. */
  durationSec: number;
  /** Publication date — RSS 2.0 expects RFC-822 format. */
  pubDate: Date;
  /** Optional season number — iTunes uses this for grouping. */
  season?: number;
  /** Optional episode number within the season. */
  episodeNumber?: number;
  /** Optional episode-art URL (3000×3000). Falls back to show art
   *  when omitted. */
  imageUrl?: string;
  /** Optional chapters — surfaced by Apple Podcasts + Spotify chapter
   *  UI. Same data the ID3 chapter writer (#907) embeds in the audio
   *  file itself; the feed exposes them so listeners see chapters
   *  before downloading the audio. */
  chapters?: Array<{
    /** Start time in seconds from the start of the file. */
    startTimeSec: number;
    /** Chapter title. */
    title: string;
    /** Optional URL surfaced in the chapter view (a "more info" link). */
    href?: string;
  }>;
}

/** Render the feed as an RSS 2.0 XML string. The caller stringifies
 *  the result + serves it from `/feed/:projectId.xml`. */
export function renderPodcastRss(spec: PodcastFeedSpec, episodes: PodcastEpisode[]): string {
  const lines: string[] = [];
  lines.push('<?xml version="1.0" encoding="UTF-8"?>');
  // Namespaces: rss + itunes + atom + podcast (for chapters).
  lines.push(
    '<rss version="2.0" xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:podcast="https://podcastindex.org/namespace/1.0">',
  );
  lines.push("  <channel>");
  lines.push(`    <title>${esc(spec.title)}</title>`);
  lines.push(`    <link>${esc(spec.link)}</link>`);
  lines.push(`    <description>${esc(spec.description)}</description>`);
  lines.push(`    <language>${esc(spec.language)}</language>`);
  if (spec.copyright) lines.push(`    <copyright>${esc(spec.copyright)}</copyright>`);
  lines.push(`    <atom:link href="${esc(spec.feedUrl)}" rel="self" type="application/rss+xml"/>`);
  lines.push(`    <itunes:author>${esc(spec.author)}</itunes:author>`);
  lines.push(`    <itunes:summary>${esc(spec.description)}</itunes:summary>`);
  lines.push(`    <itunes:explicit>${spec.explicit ? "yes" : "no"}</itunes:explicit>`);
  lines.push(`    <itunes:image href="${esc(spec.imageUrl)}"/>`);
  lines.push("    <itunes:owner>");
  lines.push(`      <itunes:name>${esc(spec.ownerName ?? spec.author)}</itunes:name>`);
  lines.push(`      <itunes:email>${esc(spec.ownerEmail)}</itunes:email>`);
  lines.push("    </itunes:owner>");
  if (spec.subcategory) {
    lines.push(`    <itunes:category text="${esc(spec.category)}">`);
    lines.push(`      <itunes:category text="${esc(spec.subcategory)}"/>`);
    lines.push(`    </itunes:category>`);
  } else {
    lines.push(`    <itunes:category text="${esc(spec.category)}"/>`);
  }

  for (const ep of episodes) {
    lines.push("    <item>");
    lines.push(`      <guid isPermaLink="false">${esc(ep.guid)}</guid>`);
    lines.push(`      <title>${esc(ep.title)}</title>`);
    lines.push(`      <description>${esc(ep.description)}</description>`);
    lines.push(`      <itunes:summary>${esc(ep.description)}</itunes:summary>`);
    lines.push(`      <pubDate>${toRfc822(ep.pubDate)}</pubDate>`);
    lines.push(
      `      <enclosure url="${esc(ep.audioUrl)}" length="${ep.audioBytes}" type="${esc(ep.audioMime)}"/>`,
    );
    lines.push(`      <itunes:duration>${formatDuration(ep.durationSec, { style: "clockHms" })}</itunes:duration>`);
    if (ep.season !== undefined) lines.push(`      <itunes:season>${ep.season}</itunes:season>`);
    if (ep.episodeNumber !== undefined) lines.push(`      <itunes:episode>${ep.episodeNumber}</itunes:episode>`);
    if (ep.imageUrl) lines.push(`      <itunes:image href="${esc(ep.imageUrl)}"/>`);
    if (ep.chapters && ep.chapters.length > 0) {
      // Podcast 2.0 chapters — JSON file referenced via the
      // `<podcast:chapters>` tag. Servers that don't host the chapter
      // JSON separately can include them inline as a data: URI.
      const json = chaptersToJson(ep.chapters);
      const dataUri = `data:application/json+chapters,${encodeURIComponent(json)}`;
      lines.push(`      <podcast:chapters url="${dataUri}" type="application/json+chapters"/>`);
    }
    lines.push("    </item>");
  }

  lines.push("  </channel>");
  lines.push("</rss>");
  return lines.join("\n");
}

/** Convert a chapter list to the Podcast 2.0 chapters JSON format. */
function chaptersToJson(
  chapters: NonNullable<PodcastEpisode["chapters"]>,
): string {
  return JSON.stringify({
    version: "1.2.0",
    chapters: chapters.map((c) => ({
      startTime: c.startTimeSec,
      title: c.title,
      ...(c.href ? { url: c.href } : {}),
    })),
  });
}

/** XML-escape a string. Mirrors the SVG / RSS conventions. */
function esc(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/** RFC-822 timestamp (RSS 2.0 mandates this format for pubDate). */
function toRfc822(date: Date): string {
  return date.toUTCString();
}
