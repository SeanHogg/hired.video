import { Hono } from "hono";
import { eq, and, sql } from "drizzle-orm";
import type { Variables } from "../types/index.js";
import { getDb, schema } from "../db/index.js";
import { isUuid } from "../../../shared/value-types.js";

const {
  videos,
  users,
  companyProfiles,
  resumeInformation,
  studioVoiceClones,
  studioProjects,
  creatorProfiles,
  userProfiles,
} = schema;

export const ogRoutes = new Hono<{ Variables: Variables }>();

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
}> {
  if (isUuid(videoId)) {
    const [proj] = await db
      .select({
        id: studioProjects.id,
        isPublic: studioProjects.isPublic,
        storyboard: studioProjects.storyboard,
        mediaKind: studioProjects.mediaKind,
        ownerName: users.name,
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
    };
  }
  return {
    isPublic: row.privacyStatus === "public",
    title: row.title,
    description: row.description,
    thumbnailUrl: row.thumbnailUrl,
    ownerName: row.ownerName,
    mediaKind: "video",
  };
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
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
    return c.json({ title: `${kindCopy.noun} — hired.video`, description: null, image: null });
  }
  const ownerSubject = meta.ownerName ?? "this creator";
  return c.json({
    title: meta.title
      ? `${meta.title} — ${kindCopy.noun} on hired.video`
      : `${meta.ownerName ?? kindCopy.noun} — ${kindCopy.noun} on hired.video`,
    description:
      meta.description
      ?? `${kindCopy.verb} ${ownerSubject}'s ${kindCopy.noun.toLowerCase()} on hired.video.`,
    image: meta.thumbnailUrl ?? null,
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
