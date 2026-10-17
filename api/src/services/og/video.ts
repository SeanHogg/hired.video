/**
 * `/v/<id>` + `/m/<id>` (image + meta) — kind-aware studio media share
 * previews (#1216 / #1218). `/m/` is the canonical media path; `/v/` is kept
 * for crawlers and old links.
 */
import { publicVideoPath } from "../../../../shared/public-paths.js";
import { isUuid } from "../../../../shared/value-types.js";
import { generateStructuredData } from "../../../../shared/structured-data.js";
import type { Db } from "../../db/index.js";
import {
  findOgLegacyVideo,
  findOgStudioProject,
  findOgVideoThumbnail,
} from "../../repositories/ogMediaRepository.js";
import type { OgImageResult, OgMetaBody } from "./og-entity-kind.js";
import { escapeXml } from "./svg-primitives.js";

// Per-kind copy for OG share previews — kept worker-side rather than in
// @shared/media-kinds because the per-kind nouns + verbs differ from the
// editor's MEDIA_KIND_UI labels (the editor says "Export drawing" but a
// share preview reads better as "Drawing on hired.video"). SSoT for the
// meta rewrite + the SVG card so they can't drift.
const OG_KIND_COPY: Record<string, { noun: string; verb: string }> = {
  video:     { noun: "Video Resume",       verb: "Watch" },
  podcast:   { noun: "Podcast Episode",    verb: "Listen to" },
  voice:     { noun: "Voiceover",          verb: "Listen to" },
  animation: { noun: "Animation",          verb: "Watch" },
  game:      { noun: "Browser Game",       verb: "Play" },
  comic:     { noun: "Comic",              verb: "Read" },
  image:     { noun: "Drawing",            verb: "View" },
  cad:       { noun: "Drafting",           verb: "View" },
};
function ogKindCopy(mediaKind: string | null | undefined) {
  return OG_KIND_COPY[mediaKind ?? "video"] ?? OG_KIND_COPY.video;
}

/** Uniform, JSON-safe (cacheable) shape for the card + the meta JSON. */
export interface OgVideoMeta {
  isPublic: boolean;
  title: string | null;
  description: string | null;
  thumbnailUrl: string | null;
  ownerName: string | null;
  mediaKind: string;
  uploadDate: string | null;
}

/** Resolves the same data the public watch page uses: project row first
 *  (v2 projects play live off `timelineSpec` and never have a `videos` row
 *  until export, and non-video kinds never have one at all), then falls
 *  back to the videos row for legacy direct uploads. Mirrors the lookup
 *  order in `/api/studio/public/:videoId`. */
export async function loadOgVideoMeta(db: Db, videoId: string): Promise<OgVideoMeta> {
  if (isUuid(videoId)) {
    const proj = await findOgStudioProject(db, videoId);
    if (proj) {
      const meta = proj.storyboard as
        | { _metaDescription?: string; _socialCardImage?: string }
        | null;
      // Try the linked video for a baked thumbnail, but the project
      // is the source of truth for visibility + title + kind.
      const vid = await findOgVideoThumbnail(db, videoId);
      return {
        isPublic: proj.isPublic,
        title: proj.name ?? null,
        description: (meta?._metaDescription as string | undefined)
          ?? vid?.description
          ?? null,
        thumbnailUrl: (meta?._socialCardImage as string | undefined)
          ?? vid?.thumbnailUrl
          ?? null,
        ownerName: proj.ownerName,
        mediaKind: (proj.mediaKind as string | null) ?? "video",
        uploadDate: proj.createdAt ? proj.createdAt.toISOString() : null,
      };
    }
  }
  // Fall back to the videos row for legacy direct uploads (no project
  // row, no canvas state — just a baked MP4 / YouTube embed).
  const row = await findOgLegacyVideo(db, videoId);
  if (!row) {
    return {
      isPublic: false,
      title: null,
      description: null,
      thumbnailUrl: null,
      ownerName: null,
      mediaKind: "video",
      uploadDate: null,
    };
  }
  return {
    isPublic: row.privacyStatus === "public",
    title: row.title,
    description: row.description,
    thumbnailUrl: row.thumbnailUrl,
    ownerName: row.ownerName,
    mediaKind: "video",
    uploadDate: row.createdAt ? row.createdAt.toISOString() : null,
  };
}

/** Public + thumbnail → 302 to it; otherwise a generated SVG card. */
export function renderVideoCard(meta: OgVideoMeta): OgImageResult {
  if (meta.isPublic && meta.thumbnailUrl) {
    return { type: "redirect", url: meta.thumbnailUrl };
  }

  const kindCopy = ogKindCopy(meta.mediaKind);
  const title = meta.isPublic
    ? (meta.title || `${meta.ownerName ?? ""}'s ${kindCopy.noun}`.trim())
    : kindCopy.noun;
  const ownerName = meta.isPublic ? (meta.ownerName || "") : "";

  // Truncate for display
  const displayTitle = title.length > 60 ? title.slice(0, 57) + "…" : title;
  const displayOwner = ownerName.length > 40 ? ownerName.slice(0, 37) + "…" : ownerName;

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#7c3aed"/>
      <stop offset="100%" stop-color="#2563eb"/>
    </linearGradient>
  </defs>
  <rect width="1200" height="630" fill="url(#bg)"/>
  <rect x="60" y="60" width="1080" height="510" rx="24" fill="rgba(255,255,255,0.08)"/>

  <!-- Play icon -->
  <circle cx="600" cy="260" r="80" fill="rgba(255,255,255,0.15)"/>
  <polygon points="575,230 575,290 635,260" fill="white"/>

  <!-- Title -->
  <text x="600" y="390" font-family="system-ui,sans-serif" font-size="42" font-weight="700"
        fill="white" text-anchor="middle" dominant-baseline="middle">${escapeXml(displayTitle)}</text>

  <!-- Owner name -->
  ${displayOwner ? `<text x="600" y="450" font-family="system-ui,sans-serif" font-size="28" fill="rgba(255,255,255,0.8)"
        text-anchor="middle" dominant-baseline="middle">${escapeXml(displayOwner)}</text>` : ""}

  <!-- Branding -->
  <text x="600" y="550" font-family="system-ui,sans-serif" font-size="22" fill="rgba(255,255,255,0.6)"
        text-anchor="middle" dominant-baseline="middle">hired.video</text>
</svg>`;

  return { type: "svg", svg, longCache: true };
}

/** Meta JSON for the public watch page — same kind-aware lookup as the card
 *  so the rewritten meta tags + the social card image match. */
export function buildVideoMeta(meta: OgVideoMeta, videoId: string, origin: string): OgMetaBody {
  const kindCopy = ogKindCopy(meta.mediaKind);
  if (!meta.isPublic) {
    return { title: `${kindCopy.noun} — hired.video`, description: null, image: null, jsonLd: [] };
  }
  const ownerSubject = meta.ownerName ?? "this creator";
  const title = meta.title
    ? `${meta.title} — ${kindCopy.noun} on hired.video`
    : `${meta.ownerName ?? kindCopy.noun} — ${kindCopy.noun} on hired.video`;
  const description =
    meta.description
    ?? `${kindCopy.verb} ${ownerSubject}'s ${kindCopy.noun.toLowerCase()} on hired.video.`;
  // Thumbnail is REQUIRED for video indexing — fall back to the generated
  // OG card (sibling /api/og/v/:id, which 302s to the baked thumbnail when
  // one exists). Never null so crawlers always get one.
  const thumbnailUrl = meta.thumbnailUrl ?? `${origin}/api/og/v/${videoId}`;
  return {
    title,
    description,
    image: thumbnailUrl,
    // VideoObject via the shared SSoT builder. embedUrl is the watch page:
    // the ONE player surface valid for every mediaKind, including
    // live-rendered canvas projects (the standalone /embed/video/frame only
    // resolves once a video is baked to MP4/YouTube).
    jsonLd: [
      generateStructuredData.videoObject({
        name: meta.title ?? `${kindCopy.noun} on hired.video`,
        description: description.slice(0, 200),
        thumbnailUrl,
        uploadDate: meta.uploadDate ?? undefined,
        embedUrl: `https://hired.video${publicVideoPath(videoId)}`,
        url: `https://hired.video${publicVideoPath(videoId)}`,
      }),
    ],
  };
}
