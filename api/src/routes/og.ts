import { Hono } from "hono";
import { eq, and, sql } from "drizzle-orm";
import type { Variables, AppEnv } from "../types/index.js";
import { getDb, schema } from "../db/index.js";
import { isUuid } from "../../../shared/value-types.js";
import { renderCourseCoverSvg, escapeXmlText as escapeXml } from "../../../shared/course-cover.js";
import { getCourseDiagram } from "../../../shared/course-diagrams.js";

const {
  videos,
  users,
  companyProfiles,
  resumeInformation,
  studioVoiceClones,
  studioProjects,
  creatorProfiles,
  userProfiles,
  articles,
} = schema;

export const ogRoutes = new Hono<AppEnv>();

// Per-kind copy for OG share previews — kept here (next to the only
// consumer) rather than in @shared/media-kinds because OG branding is
// a worker-side concern and the per-kind nouns + verbs differ from
// the editor's MEDIA_KIND_UI labels (the editor says "Export drawing"
// but a share preview reads better as "Drawing on hired.video").
// SSoT for the rewrite + the SVG card so they can't drift.
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

// ─── GET /page ───────────────────────────────────────────────────────────────
// Generic branded social card for any marketing / app route. Driven entirely
// by query params (title + optional eyebrow + subtitle) so the build-time
// prerender (frontend/scripts/prerender.mjs) can give EVERY indexable route
// its own share image — instead of every page falling back to the single
// static og-image.svg — without this worker needing to know the route table.
// Stable per (title, eyebrow, subtitle) so the SVG is edge-cached for a day.
ogRoutes.get("/page", (c) => {
  const title = truncate((c.req.query("title") || "hired.video").trim(), 90);
  const eyebrow = truncate((c.req.query("eyebrow") || "").trim(), 30).toUpperCase();
  const subtitle = truncate((c.req.query("subtitle") || "").trim(), 130);
  return svgResponse(renderPageCard({ title, eyebrow, subtitle }), true);
});

// ─── GET /companies/:id ──────────────────────────────────────────────────────
// Social card for a company profile. Surfaces the cached
// review_avg_overall + review_count from company_profiles (kept in
// sync by recomputeAggregateCache in routes/reviews.ts) so the share
// preview shows star rating + count without re-scanning reviews.
ogRoutes.get("/companies/:id", async (c) => {
  const { id } = c.req.param();
  const db = getDb();

  const [row] = await db
    .select({
      name: companyProfiles.name,
      logoUrl: companyProfiles.logoUrl,
      tagline: companyProfiles.tagline,
      reviewCount: companyProfiles.reviewCount,
      reviewAvg: companyProfiles.reviewAvgOverall,
    })
    .from(companyProfiles)
    .where(isUuid(id) ? eq(companyProfiles.id, id) : eq(companyProfiles.slug, id))
    .limit(1);

  const name = row?.name ?? "Company";
  const tagline = row?.tagline ?? "";
  const avg = row?.reviewAvg ? Number(row.reviewAvg) : null;
  const count = row?.reviewCount ?? 0;

  const displayTitle = name.length > 50 ? name.slice(0, 47) + "…" : name;
  const displayTagline = tagline.length > 80 ? tagline.slice(0, 77) + "…" : tagline;
  const stars = avg !== null ? renderStars(avg) : "";
  const ratingLine =
    avg !== null && count > 0
      ? `${stars}  ${avg.toFixed(1)} · ${count} review${count === 1 ? "" : "s"}`
      : "No reviews yet";

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#0f172a"/>
      <stop offset="100%" stop-color="#1e3a8a"/>
    </linearGradient>
  </defs>
  <rect width="1200" height="630" fill="url(#bg)"/>
  <rect x="60" y="60" width="1080" height="510" rx="24" fill="rgba(255,255,255,0.06)"/>

  <text x="100" y="200" font-family="system-ui,sans-serif" font-size="56" font-weight="700"
        fill="white">${escapeXml(displayTitle)}</text>

  ${displayTagline ? `<text x="100" y="270" font-family="system-ui,sans-serif" font-size="28"
        fill="rgba(255,255,255,0.75)">${escapeXml(displayTagline)}</text>` : ""}

  <text x="100" y="430" font-family="system-ui,sans-serif" font-size="44" fill="#fbbf24">${escapeXml(ratingLine)}</text>

  <text x="100" y="550" font-family="system-ui,sans-serif" font-size="22" fill="rgba(255,255,255,0.6)">hired.video</text>
</svg>`;

  return new Response(svg, {
    headers: {
      "Content-Type": "image/svg+xml",
      "Cache-Control": "public, max-age=600, s-maxage=3600",
    },
  });
});

/** Render the 5-star row as Unicode characters tuned to the average.
 *  Half-stars round up at >= 0.5. Used in the SVG body — CSS-styled
 *  half-fills are tricky in raw SVG and the Unicode ★/☆ render fine
 *  in social-card previews. */
function renderStars(avg: number): string {
  const rounded = Math.round(avg);
  return "★".repeat(rounded) + "☆".repeat(5 - rounded);
}

// ─── GET /v/:videoId ──────────────────────────────────────────────────────────
// Returns an OG image for the public video resume share page.
// If the video has a thumbnailUrl, redirects to it.
// Otherwise, generates a simple SVG social card.
ogRoutes.get("/v/:videoId", async (c) => {
  const { videoId } = c.req.param();
  const db = getDb();

  // Resolve mediaKind + title + thumbnail by looking at the project
  // first (covers every kind including non-video), then falling back
  // to the videos row for legacy direct uploads. Mirrors the lookup
  // order in `/api/studio/public/:videoId` so the share preview and
  // the watch page see the same source-of-truth.
  const meta = await resolveOgMetaForVideoId(db, videoId);

  // If a thumbnail exists and the project is public, redirect to it.
  if (meta.isPublic && meta.thumbnailUrl) {
    return c.redirect(meta.thumbnailUrl, 302);
  }

  const kindCopy = ogKindCopy(meta.mediaKind);
  // Otherwise generate an SVG social card
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

  return new Response(svg, {
    headers: {
      "Content-Type": "image/svg+xml",
      "Cache-Control": "public, max-age=3600, s-maxage=86400",
    },
  });
});

/** Shared lookup for the `/v/<id>` OG endpoints (#1216). Resolves the
 *  same data the public watch page uses: project row first (because v2
 *  projects play live off `timelineSpec` and never have a `videos` row
 *  until export, and non-video kinds never have one at all), then
 *  falls back to the videos row for legacy direct uploads. Returns a
 *  uniform shape so the SVG card + the meta JSON both branch off
 *  `mediaKind` consistently. */
async function resolveOgMetaForVideoId(
  db: ReturnType<typeof getDb>,
  videoId: string,
): Promise<{
  isPublic: boolean;
  title: string | null;
  description: string | null;
  thumbnailUrl: string | null;
  ownerName: string | null;
  mediaKind: string;
  uploadDate: string | null;
}> {
  if (isUuid(videoId)) {
    const [proj] = await db
      .select({
        id: studioProjects.id,
        isPublic: studioProjects.isPublic,
        storyboard: studioProjects.storyboard,
        mediaKind: studioProjects.mediaKind,
        ownerName: users.name,
        createdAt: studioProjects.createdAt,
      })
      .from(studioProjects)
      .innerJoin(users, eq(studioProjects.userId, users.id))
      .where(eq(studioProjects.id, videoId))
      .limit(1);
    if (proj) {
      const meta = proj.storyboard as
        | { _name?: string; _metaDescription?: string; _socialCardImage?: string }
        | null;
      // Try the linked video for a baked thumbnail, but the project
      // is the source of truth for visibility + title + kind.
      const [vid] = await db
        .select({ thumbnailUrl: videos.thumbnailUrl, description: videos.description })
        .from(videos)
        .where(eq(videos.id, videoId))
        .limit(1);
      return {
        isPublic: proj.isPublic,
        title: (meta?._name as string | undefined) ?? null,
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
  const [row] = await db
    .select({
      title: videos.title,
      description: videos.description,
      thumbnailUrl: videos.thumbnailUrl,
      privacyStatus: videos.privacyStatus,
      ownerName: users.name,
      createdAt: videos.createdAt,
    })
    .from(videos)
    .innerJoin(users, eq(videos.userId, users.id))
    .where(eq(videos.id, videoId))
    .limit(1);
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

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}

function svgResponse(svg: string, longCache = false): Response {
  return new Response(svg, {
    headers: {
      "Content-Type": "image/svg+xml",
      "Cache-Control": longCache
        ? "public, max-age=3600, s-maxage=86400"
        : "public, max-age=600, s-maxage=3600",
    },
  });
}

// ─── GET /r/:id ───────────────────────────────────────────────────────────────
// Social card for a resume. Front-end shares /resumes/:id; the og-server
// rewrites the page's og:image to point here so the LinkedIn/Twitter preview
// shows the candidate's title + owner name instead of the generic logo.
ogRoutes.get("/r/:id", async (c) => {
  const { id } = c.req.param();
  const db = getDb();

  const [row] = await db
    .select({
      title: resumeInformation.title,
      ownerName: users.name,
      avatarUrl: userProfiles.avatarUrl,
      headline: userProfiles.headline,
    })
    .from(resumeInformation)
    .innerJoin(users, eq(resumeInformation.userId, users.id))
    .leftJoin(userProfiles, eq(resumeInformation.userId, userProfiles.userId))
    .where(eq(resumeInformation.id, id))
    .limit(1);

  const title = truncate(row?.title ?? "Resume", 60);
  const owner = truncate(row?.ownerName ?? "", 40);
  const headline = truncate(row?.headline ?? "", 70);

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#0f172a"/>
      <stop offset="100%" stop-color="#7c3aed"/>
    </linearGradient>
  </defs>
  <rect width="1200" height="630" fill="url(#bg)"/>
  <rect x="60" y="60" width="1080" height="510" rx="24" fill="rgba(255,255,255,0.06)"/>
  <text x="100" y="180" font-family="system-ui,sans-serif" font-size="28" fill="rgba(255,255,255,0.7)">Video Resume</text>
  <text x="100" y="270" font-family="system-ui,sans-serif" font-size="56" font-weight="700" fill="white">${escapeXml(title)}</text>
  ${owner ? `<text x="100" y="340" font-family="system-ui,sans-serif" font-size="32" fill="rgba(255,255,255,0.85)">${escapeXml(owner)}</text>` : ""}
  ${headline ? `<text x="100" y="395" font-family="system-ui,sans-serif" font-size="24" fill="rgba(255,255,255,0.65)">${escapeXml(headline)}</text>` : ""}
  <text x="100" y="550" font-family="system-ui,sans-serif" font-size="22" fill="rgba(255,255,255,0.6)">hired.video</text>
</svg>`;

  return svgResponse(svg, true);
});

// ─── GET /voice/:slug ─────────────────────────────────────────────────────────
// Social card for a public voice-clone marketplace listing. Looks up by
// listingSlug rather than uuid so share URLs stay human-readable.
ogRoutes.get("/voice/:slug", async (c) => {
  const { slug } = c.req.param();
  const db = getDb();

  const [row] = await db
    .select({
      name: studioVoiceClones.name,
      description: studioVoiceClones.description,
      language: studioVoiceClones.language,
      gender: studioVoiceClones.gender,
      priceCents: studioVoiceClones.priceCents,
      visibility: studioVoiceClones.visibility,
      ownerName: users.name,
    })
    .from(studioVoiceClones)
    .innerJoin(users, eq(studioVoiceClones.userId, users.id))
    .where(eq(studioVoiceClones.listingSlug, slug))
    .limit(1);

  if (!row || row.visibility !== "public") {
    // Fall through to a generic card rather than 404 — social scrapers retry forever.
    return svgResponse(genericCard("Voice Marketplace", "hired.video"));
  }

  const name = truncate(row.name ?? "Voice", 50);
  const desc = truncate(row.description ?? "", 90);
  const meta = [row.language, row.gender].filter(Boolean).join(" · ");
  const price = row.priceCents != null ? `$${(row.priceCents / 100).toFixed(2)}` : "";

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#06b6d4"/>
      <stop offset="100%" stop-color="#7c3aed"/>
    </linearGradient>
  </defs>
  <rect width="1200" height="630" fill="url(#bg)"/>
  <rect x="60" y="60" width="1080" height="510" rx="24" fill="rgba(255,255,255,0.08)"/>
  <!-- Mic glyph -->
  <g transform="translate(110,150)">
    <rect x="0" y="0" width="56" height="100" rx="28" fill="white" opacity="0.95"/>
    <rect x="-12" y="110" width="80" height="6" rx="3" fill="white" opacity="0.85"/>
    <rect x="22" y="120" width="12" height="32" fill="white" opacity="0.85"/>
  </g>
  <text x="200" y="220" font-family="system-ui,sans-serif" font-size="56" font-weight="700" fill="white">${escapeXml(name)}</text>
  ${desc ? `<text x="200" y="280" font-family="system-ui,sans-serif" font-size="26" fill="rgba(255,255,255,0.75)">${escapeXml(desc)}</text>` : ""}
  ${meta ? `<text x="200" y="340" font-family="system-ui,sans-serif" font-size="22" fill="rgba(255,255,255,0.6)">${escapeXml(meta)}</text>` : ""}
  ${price ? `<text x="100" y="500" font-family="system-ui,sans-serif" font-size="64" font-weight="700" fill="#fbbf24">${escapeXml(price)}</text>` : ""}
  <text x="100" y="560" font-family="system-ui,sans-serif" font-size="22" fill="rgba(255,255,255,0.6)">${escapeXml(`Voice clone by ${row.ownerName ?? "creator"} · hired.video`)}</text>
</svg>`;

  return svgResponse(svg, true);
});

// ─── GET /creator/:userId ─────────────────────────────────────────────────────
// Social card for a public creator profile.
ogRoutes.get("/creator/:userId", async (c) => {
  const { userId } = c.req.param();
  const db = getDb();

  const [row] = await db
    .select({
      displayName: creatorProfiles.displayName,
      tagline: creatorProfiles.tagline,
      averageRating: creatorProfiles.averageRating,
      completedProjectsCount: creatorProfiles.completedProjectsCount,
      isActive: creatorProfiles.isActive,
      ownerName: users.name,
    })
    .from(creatorProfiles)
    .innerJoin(users, eq(creatorProfiles.userId, users.id))
    .where(and(
      eq(creatorProfiles.userId, userId),
      eq(users.emailVerified, true),
      sql`${creatorProfiles.endedAt} IS NULL`,
    ))
    .limit(1);

  if (!row || !row.isActive) {
    return svgResponse(genericCard("Creator Marketplace", "hired.video"));
  }

  const name = truncate(row.displayName ?? row.ownerName ?? "Creator", 50);
  const tagline = truncate(row.tagline ?? "", 90);
  const avg = row.averageRating != null ? Number(row.averageRating) : null;
  const ratingLine =
    avg != null && avg > 0
      ? `${"★".repeat(Math.round(avg))}${"☆".repeat(5 - Math.round(avg))}  ${avg.toFixed(1)} · ${row.completedProjectsCount ?? 0} projects`
      : `${row.completedProjectsCount ?? 0} projects delivered`;

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#1e3a8a"/>
      <stop offset="100%" stop-color="#db2777"/>
    </linearGradient>
  </defs>
  <rect width="1200" height="630" fill="url(#bg)"/>
  <rect x="60" y="60" width="1080" height="510" rx="24" fill="rgba(255,255,255,0.06)"/>
  <text x="100" y="180" font-family="system-ui,sans-serif" font-size="28" fill="rgba(255,255,255,0.7)">Creator on hired.video</text>
  <text x="100" y="270" font-family="system-ui,sans-serif" font-size="56" font-weight="700" fill="white">${escapeXml(name)}</text>
  ${tagline ? `<text x="100" y="330" font-family="system-ui,sans-serif" font-size="26" fill="rgba(255,255,255,0.75)">${escapeXml(tagline)}</text>` : ""}
  <text x="100" y="430" font-family="system-ui,sans-serif" font-size="36" fill="#fbbf24">${escapeXml(ratingLine)}</text>
  <text x="100" y="550" font-family="system-ui,sans-serif" font-size="22" fill="rgba(255,255,255,0.6)">hired.video</text>
</svg>`;

  return svgResponse(svg, true);
});

// ─── JSON metadata endpoints ─────────────────────────────────────────────────
// Returned to the Cloudflare Pages Function so it can rewrite per-content
// og:title and og:description on the SPA HTML for social crawlers (LinkedIn,
// X, Facebook). The Pages Function caches these short-term per URL. Fields
// are intentionally minimal — title + description are the two LinkedIn/X
// preview cards actually surface.

ogRoutes.get("/v/:videoId/meta", async (c) => {
  const { videoId } = c.req.param();
  const db = getDb();
  // Resolve via the same kind-aware lookup the SVG card uses so the
  // rewritten meta tags + the social card image match (e.g. share
  // preview of a Photoshop drawing says "Drawing on hired.video"
  // alongside the drawing's thumbnail rather than the legacy
  // "Video Resume" copy that landed regardless of kind — #1216).
  const meta = await resolveOgMetaForVideoId(db, videoId);
  const kindCopy = ogKindCopy(meta.mediaKind);
  if (!meta.isPublic) {
    return c.json({ title: `${kindCopy.noun} — hired.video`, description: null, image: null, jsonLd: [] });
  }
  const ownerSubject = meta.ownerName ?? "this creator";
  const origin = new URL(c.req.url).origin;
  const title = meta.title
    ? `${meta.title} — ${kindCopy.noun} on hired.video`
    : `${meta.ownerName ?? kindCopy.noun} — ${kindCopy.noun} on hired.video`;
  const description =
    meta.description
    ?? `${kindCopy.verb} ${ownerSubject}'s ${kindCopy.noun.toLowerCase()} on hired.video.`;
  // Thumbnail is REQUIRED for video indexing — fall back to the generated
  // OG card (this endpoint's sibling /api/og/v/:id, which 302s to the baked
  // thumbnail when one exists). Never null so crawlers always get one.
  const thumbnailUrl = meta.thumbnailUrl ?? `${origin}/api/og/v/${videoId}`;
  return c.json({
    title,
    description,
    image: thumbnailUrl,
    // VideoObject for crawler-side injection (Cloudflare Pages Function).
    // Mirrors generateStructuredData.videoObject in frontend/lib/seo.ts —
    // keep the two in sync.
    jsonLd: [
      {
        "@context": "https://schema.org",
        "@type": "VideoObject",
        name: meta.title ?? `${kindCopy.noun} on hired.video`,
        url: `https://hired.video/v/${videoId}`,
        description: description.slice(0, 200),
        thumbnailUrl,
        ...(meta.uploadDate ? { uploadDate: meta.uploadDate } : {}),
        embedUrl: `https://hired.video/v/${videoId}`,
      },
    ],
  });
});

ogRoutes.get("/voice/:slug/meta", async (c) => {
  const { slug } = c.req.param();
  const db = getDb();
  const [row] = await db
    .select({
      name: studioVoiceClones.name,
      description: studioVoiceClones.description,
      language: studioVoiceClones.language,
      gender: studioVoiceClones.gender,
      priceCents: studioVoiceClones.priceCents,
      visibility: studioVoiceClones.visibility,
      ownerName: users.name,
    })
    .from(studioVoiceClones)
    .innerJoin(users, eq(studioVoiceClones.userId, users.id))
    .where(eq(studioVoiceClones.listingSlug, slug))
    .limit(1);

  if (!row || row.visibility !== "public") {
    return c.json({ title: "Voice Clone on hired.video", description: null });
  }

  const meta = [row.language, row.gender].filter(Boolean).join(" · ");
  const price = row.priceCents != null ? `$${(row.priceCents / 100).toFixed(2)}` : null;
  return c.json({
    title: `${row.name} — AI Voice Clone on hired.video${price ? ` (${price})` : ""}`,
    description: row.description ?? `License this AI voice clone${meta ? ` (${meta})` : ""} for your videos. Created by ${row.ownerName ?? "a creator"} on hired.video.`,
  });
});

ogRoutes.get("/creator/:userId/meta", async (c) => {
  const { userId } = c.req.param();
  const db = getDb();
  const [row] = await db
    .select({
      displayName: creatorProfiles.displayName,
      tagline: creatorProfiles.tagline,
      bio: creatorProfiles.bio,
      averageRating: creatorProfiles.averageRating,
      completedProjectsCount: creatorProfiles.completedProjectsCount,
      isActive: creatorProfiles.isActive,
      ownerName: users.name,
    })
    .from(creatorProfiles)
    .innerJoin(users, eq(creatorProfiles.userId, users.id))
    .where(and(
      eq(creatorProfiles.userId, userId),
      eq(users.emailVerified, true),
      sql`${creatorProfiles.endedAt} IS NULL`,
    ))
    .limit(1);

  if (!row || !row.isActive) {
    return c.json({ title: "Creator on hired.video", description: null });
  }

  const name = row.displayName ?? row.ownerName ?? "Creator";
  const stats = row.completedProjectsCount && row.completedProjectsCount > 0
    ? `${row.completedProjectsCount} project${row.completedProjectsCount === 1 ? "" : "s"} delivered`
    : "Available for new briefs";
  return c.json({
    title: `${name} — Creator on hired.video`,
    description: row.tagline ?? row.bio ?? `${name} is a creator on hired.video — book a custom promo video, pitch, or intro. ${stats}.`,
  });
});

ogRoutes.get("/r/:id/meta", async (c) => {
  const { id } = c.req.param();
  const db = getDb();
  const [row] = await db
    .select({
      title: resumeInformation.title,
      ownerName: users.name,
      headline: userProfiles.headline,
    })
    .from(resumeInformation)
    .innerJoin(users, eq(resumeInformation.userId, users.id))
    .leftJoin(userProfiles, eq(resumeInformation.userId, userProfiles.userId))
    .where(eq(resumeInformation.id, id))
    .limit(1);

  if (!row) {
    return c.json({ title: "Resume on hired.video", description: null });
  }

  const owner = row.ownerName ?? "this candidate";
  return c.json({
    title: `${row.title ?? owner + "'s Resume"} — hired.video`,
    description: row.headline
      ? `${owner} — ${row.headline}. View the full resume on hired.video.`
      : `${owner}'s resume on hired.video — watch their video, see their skills, and get in touch.`,
  });
});

// ─── GET /article/:userRef/:slug/meta ──────────────────────────────────────────
// Crawler-facing metadata for a DB-backed article (/articles/:authorSlug/:slug).
// Returns title + description + a guaranteed image + the Article JSON-LD so the
// Cloudflare Pages Function can inject an image-bearing rich result into the
// HTML for search/AI crawlers without executing the SPA — closing the
// "articles missing thumbnails" gap. Mirrors the article public query in
// routes/articles.ts and the Article adapter in frontend/lib/seo-ugc.ts.
ogRoutes.get("/article/:userRef/:slug/meta", async (c) => {
  const { userRef, slug } = c.req.param();
  const db = getDb();
  const origin = new URL(c.req.url).origin;
  // Slow-changing per-article metadata, consumed only on the crawler path
  // (the Pages Function caches the resulting HTML too). Edge-cache it.
  c.header("Cache-Control", "public, max-age=300, s-maxage=3600");

  // Resolve the first path segment (UUID or customUrlSlug) to a userId.
  let authorUserId: string | null = isUuid(userRef) ? userRef : null;
  if (!authorUserId) {
    const [p] = await db
      .select({ userId: userProfiles.userId })
      .from(userProfiles)
      .where(eq(userProfiles.customUrlSlug, userRef))
      .limit(1);
    authorUserId = p?.userId ?? null;
  }
  if (!authorUserId) {
    return c.json({ title: "Article — hired.video", description: null, image: null, jsonLd: [] });
  }

  const [row] = await db
    .select({
      title: articles.title,
      summary: articles.summary,
      coverImageUrl: articles.coverImageUrl,
      category: articles.category,
      tags: articles.tags,
      publishedAt: articles.publishedAt,
      updatedAt: articles.updatedAt,
      authorName: users.name,
      authorSlug: userProfiles.customUrlSlug,
      authorId: users.id,
    })
    .from(articles)
    .innerJoin(users, eq(articles.userId, users.id))
    .leftJoin(userProfiles, eq(userProfiles.userId, users.id))
    .where(and(
      eq(articles.userId, authorUserId),
      eq(articles.slug, slug),
      eq(articles.status, "published"),
      eq(users.emailVerified, true),
    ))
    .limit(1);

  if (!row) {
    return c.json({ title: "Article — hired.video", description: null, image: null, jsonLd: [] });
  }

  const title = `${row.title} — hired.video`;
  const description = (row.summary ?? "").trim().slice(0, 160) || `${row.title} on hired.video.`;
  // Cover image with the same fallback chain as articleCoverImageUrl: a
  // stored cover (absolutized onto the API origin), else the generated card.
  const image = row.coverImageUrl
    ? (row.coverImageUrl.startsWith("http") ? row.coverImageUrl : `${origin}${row.coverImageUrl.startsWith("/") ? "" : "/"}${row.coverImageUrl}`)
    : `${origin}/api/og/articles?${new URLSearchParams({
        title: row.title,
        ...(row.category ? { category: row.category } : {}),
        ...(row.publishedAt ? { date: row.publishedAt.toISOString().slice(0, 10) } : {}),
        ...(row.authorName ? { author: row.authorName } : {}),
      }).toString()}`;
  const authorRef = row.authorSlug ?? row.authorId;
  const pageUrl = `https://hired.video/articles/${authorRef}/${slug}`;

  return c.json({
    title,
    description,
    image,
    // Article JSON-LD — mirrors generateStructuredData.article in
    // frontend/lib/seo.ts; keep the two in sync.
    jsonLd: [
      {
        "@context": "https://schema.org",
        "@type": "Article",
        headline: row.title,
        mainEntityOfPage: { "@type": "WebPage", "@id": pageUrl },
        image,
        url: pageUrl,
        description,
        ...(row.publishedAt ? { datePublished: row.publishedAt.toISOString() } : {}),
        ...(row.updatedAt || row.publishedAt
          ? { dateModified: (row.updatedAt ?? row.publishedAt)!.toISOString() }
          : {}),
        ...(row.authorName
          ? { author: { "@type": "Person", name: row.authorName, url: `https://hired.video/people/${authorRef}` } }
          : {}),
        ...(Array.isArray(row.tags) && row.tags.length > 0 ? { keywords: row.tags.join(", ") } : {}),
        publisher: {
          "@type": "Organization",
          name: "hired.video",
          logo: { "@type": "ImageObject", url: "https://hired.video/og-image.svg" },
        },
      },
    ],
  });
});

// ─── GET /blog ────────────────────────────────────────────────────────────────
// Social card for a blog post. Driven by query params because blog posts
// live in the front-end registry (frontend/data/blog-posts.ts), not the
// database — the page passes its own title/category/date through. The
// resulting URL is stable for a given post (title + category rarely
// change) so the response is edge-cached for a day.
ogRoutes.get("/blog", async (c) => {
  const title = truncate(c.req.query("title") || "hired.video Blog", 60);
  const category = truncate(c.req.query("category") || "", 40);
  const date = truncate(c.req.query("date") || "", 30);
  const author = truncate(c.req.query("author") || "Sean Hogg", 30);

  const dateLine = [category, date].filter(Boolean).join(" · ");

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#0f172a"/>
      <stop offset="100%" stop-color="#7c3aed"/>
    </linearGradient>
  </defs>
  <rect width="1200" height="630" fill="url(#bg)"/>
  <rect x="60" y="60" width="1080" height="510" rx="24" fill="rgba(255,255,255,0.06)"/>
  <text x="100" y="170" font-family="system-ui,sans-serif" font-size="24" fill="rgba(255,255,255,0.6)">hired.video Blog</text>
  <text x="100" y="270" font-family="system-ui,sans-serif" font-size="56" font-weight="700" fill="white">${escapeXml(title)}</text>
  ${dateLine ? `<text x="100" y="340" font-family="system-ui,sans-serif" font-size="26" fill="rgba(255,255,255,0.7)">${escapeXml(dateLine)}</text>` : ""}
  <text x="100" y="540" font-family="system-ui,sans-serif" font-size="24" fill="rgba(255,255,255,0.65)">by ${escapeXml(author)}</text>
  <text x="100" y="580" font-family="system-ui,sans-serif" font-size="20" fill="rgba(255,255,255,0.5)">hired.video/blog</text>
</svg>`;

  return svgResponse(svg, true);
});

// ─── GET /articles ────────────────────────────────────────────────────────────
// Social card fallback for an article. The 14 editorial articles seeded by
// migration 0113 (and the bulk of creator-authored ones today) ship without
// a `cover_image_url`, so [ArticleRecord adapter](../../frontend/lib/seo-ugc.ts)
// + [ArticleView hero](../../frontend/pages/ArticleView.tsx) both fall
// back here to keep every share preview branded. Driven by query params
// (title / category / author / date) so the URL is stable per article and
// the SVG can be edge-cached for a day.
ogRoutes.get("/articles", async (c) => {
  const title = truncate(c.req.query("title") || "hired.video Articles", 70);
  const category = truncate(c.req.query("category") || "", 40);
  const date = truncate(c.req.query("date") || "", 30);
  const author = truncate(c.req.query("author") || "hired.video Editorial", 40);

  const metaLine = [category, date].filter(Boolean).join(" · ");

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#1e1b4b"/>
      <stop offset="100%" stop-color="#7c3aed"/>
    </linearGradient>
  </defs>
  <rect width="1200" height="630" fill="url(#bg)"/>
  <rect x="60" y="60" width="1080" height="510" rx="24" fill="rgba(255,255,255,0.06)"/>
  <text x="100" y="170" font-family="system-ui,sans-serif" font-size="24" fill="rgba(255,255,255,0.6)">hired.video Articles</text>
  <text x="100" y="270" font-family="system-ui,sans-serif" font-size="52" font-weight="700" fill="white">${escapeXml(title)}</text>
  ${metaLine ? `<text x="100" y="340" font-family="system-ui,sans-serif" font-size="26" fill="rgba(255,255,255,0.7)">${escapeXml(metaLine)}</text>` : ""}
  <text x="100" y="540" font-family="system-ui,sans-serif" font-size="24" fill="rgba(255,255,255,0.65)">by ${escapeXml(author)}</text>
  <text x="100" y="580" font-family="system-ui,sans-serif" font-size="20" fill="rgba(255,255,255,0.5)">hired.video/articles</text>
</svg>`;

  return svgResponse(svg, true);
});

// ─── GET /courses ───────────────────────────────────────────────────────────
// Deterministic cover card for a course. The seeded Learning Content Library
// (migration 0131) ships every course with `cover_image_url = NULL`, so the
// marketplace + /tools Learning grid fell back to a bare GraduationCap icon —
// the client-side "Auto-generate cover" CTA (#1400) never fires for the
// system-owned seed library. Migration 0190 backfills `cover_image_url` to
// this endpoint. Driven by query params (title / category / difficulty) so the
// URL is stable per course and edge-cacheable for a day. The SVG body is the
// shared [@shared/course-cover] renderer, so a server-rendered cover is
// byte-identical to one the creator generates + uploads client-side.
ogRoutes.get("/courses", async (c) => {
  const title = (c.req.query("title") || "Course").slice(0, 120);
  const category = c.req.query("category") || null;
  const difficulty = c.req.query("difficulty") || null;
  return svgResponse(renderCourseCoverSvg({ title, category, difficulty }), true);
});

// ─── GET /lesson-diagram ──────────────────────────────────────────────────────
// Schematic concept diagram for a seeded course lesson. Embedded into each
// lesson's `body_md` as a markdown image by migration 0190, so it renders
// through the existing ReactMarkdown path in CourseLearner with no new renderer
// wiring (and no XSS surface — SVG inside an <img> can't execute script). The
// `d` key mirrors the seed lesson slug (`ai-fund-l1`). Unknown keys 404 rather
// than render a blank card so a typo surfaces in the lesson body immediately.
ogRoutes.get("/lesson-diagram", async (c) => {
  const key = c.req.query("d") || "";
  const diagram = getCourseDiagram(key);
  if (!diagram) {
    return c.json({ error: "unknown_diagram" }, 404);
  }
  return svgResponse(diagram.svg, true);
});

/** Word-wrap `text` into at most `maxLines` lines of roughly `maxChars`
 *  characters each, appending an ellipsis when it overflows. Pure string
 *  math — SVG <text> has no auto-wrap, so the marketing card lays the
 *  headline out by hand. */
function wrapText(text: string, maxChars: number, maxLines: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let cur = "";
  let consumed = 0;
  for (const w of words) {
    const cand = cur ? `${cur} ${w}` : w;
    if (cand.length > maxChars && cur) {
      lines.push(cur);
      cur = w;
      consumed++;
      if (lines.length === maxLines) break;
    } else {
      cur = cand;
      consumed++;
    }
  }
  if (lines.length < maxLines && cur) lines.push(cur);
  // If words were dropped because we hit maxLines, mark the truncation.
  if (consumed < words.length && lines.length) {
    let last = lines[lines.length - 1].replace(/[.,;:\s]+$/, "");
    while (last.length > maxChars - 1 && last.includes(" ")) {
      last = last.slice(0, last.lastIndexOf(" "));
    }
    lines[lines.length - 1] = `${last}…`;
  }
  return lines;
}

/** Branded marketing share card (1200×630) — brand gradient + eyebrow tag +
 *  wrapped headline + optional subtitle + footer. Shared by the `/page`
 *  endpoint so every prerendered route can point its og:image here. Mirrors
 *  the hand-designed public/og-image.svg palette (#7c3aed→#3b82f6) so the
 *  generated per-page cards sit in the same brand family as the home hero. */
function renderPageCard(opts: { title: string; eyebrow: string; subtitle: string }): string {
  const titleLines = wrapText(opts.title, 26, 3);
  const fontSize = titleLines.length >= 3 ? 50 : titleLines.length === 2 ? 58 : 66;
  const lineHeight = fontSize + 12;
  // Center the title block vertically, biased up to leave room for the
  // subtitle + footer. `startY` is the baseline of the first line.
  const startY = 320 - ((titleLines.length - 1) * lineHeight) / 2;
  const titleSvg = titleLines
    .map(
      (line, i) =>
        `<text x="100" y="${startY + i * lineHeight}" font-family="system-ui,-apple-system,'Segoe UI',sans-serif" font-size="${fontSize}" font-weight="800" fill="white" letter-spacing="-1">${escapeXml(line)}</text>`,
    )
    .join("\n  ");
  const subtitleY = startY + (titleLines.length - 1) * lineHeight + 64;
  const subtitleSvg = opts.subtitle
    ? `<text x="100" y="${subtitleY}" font-family="system-ui,-apple-system,'Segoe UI',sans-serif" font-size="26" font-weight="400" fill="white" opacity="0.78">${escapeXml(opts.subtitle)}</text>`
    : "";
  const eyebrowSvg = opts.eyebrow
    ? `<text x="100" y="150" font-family="system-ui,-apple-system,'Segoe UI',sans-serif" font-size="24" font-weight="700" fill="#a5b4fc" letter-spacing="2">${escapeXml(opts.eyebrow)}</text>`
    : "";

  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#7c3aed"/>
      <stop offset="50%" stop-color="#6d28d9"/>
      <stop offset="100%" stop-color="#3b82f6"/>
    </linearGradient>
  </defs>
  <rect width="1200" height="630" fill="url(#bg)"/>
  <circle cx="1050" cy="120" r="180" fill="white" opacity="0.05"/>
  <circle cx="150" cy="540" r="120" fill="white" opacity="0.05"/>
  <!-- Brand glyph (video camera, matches favicon) -->
  <g transform="translate(100, 70) scale(1.6)" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" fill="none" opacity="0.9">
    <rect x="2" y="6" width="14" height="12" rx="2"/>
    <path d="m16 13 5.223 3.482a.5.5 0 0 0 .777-.416V7.87a.5.5 0 0 0-.752-.432L16 10.5"/>
  </g>
  ${eyebrowSvg}
  ${titleSvg}
  ${subtitleSvg}
  <rect x="0" y="588" width="1200" height="42" fill="black" opacity="0.18"/>
  <text x="100" y="616" font-family="system-ui,sans-serif" font-size="22" font-weight="600" fill="white" opacity="0.85">hired.video</text>
  <text x="1100" y="616" font-family="system-ui,sans-serif" font-size="20" fill="white" opacity="0.6" text-anchor="end">AI video resumes &amp; career tools</text>
</svg>`;
}

function genericCard(line1: string, line2: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
    <defs>
      <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="#7c3aed"/>
        <stop offset="100%" stop-color="#2563eb"/>
      </linearGradient>
    </defs>
    <rect width="1200" height="630" fill="url(#bg)"/>
    <text x="600" y="320" font-family="system-ui,sans-serif" font-size="60" font-weight="700"
          fill="white" text-anchor="middle">${escapeXml(line1)}</text>
    <text x="600" y="390" font-family="system-ui,sans-serif" font-size="28"
          fill="rgba(255,255,255,0.75)" text-anchor="middle">${escapeXml(line2)}</text>
  </svg>`;
}
