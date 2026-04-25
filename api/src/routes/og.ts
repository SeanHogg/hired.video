import { Hono } from "hono";
import { eq } from "drizzle-orm";
import type { Variables } from "../types/index.js";
import { getDb, schema } from "../db/index.js";

const { videos, users, companyProfiles } = schema;

export const ogRoutes = new Hono<{ Variables: Variables }>();

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
    .where(eq(companyProfiles.id, id))
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

  const rows = await db
    .select({
      title: videos.title,
      thumbnailUrl: videos.thumbnailUrl,
      privacyStatus: videos.privacyStatus,
      ownerName: users.name,
    })
    .from(videos)
    .innerJoin(users, eq(videos.userId, users.id))
    .where(eq(videos.id, videoId))
    .limit(1);

  // If video exists and has a thumbnail, redirect to it
  if (rows.length && rows[0].privacyStatus === "public" && rows[0].thumbnailUrl) {
    return c.redirect(rows[0].thumbnailUrl, 302);
  }

  // Otherwise generate an SVG social card
  const title = rows.length && rows[0].privacyStatus === "public"
    ? (rows[0].title || `${rows[0].ownerName}'s Video Resume`)
    : "Video Resume";
  const ownerName = rows.length && rows[0].privacyStatus === "public"
    ? (rows[0].ownerName || "")
    : "";

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

function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
