import { Hono } from "hono";
import { eq } from "drizzle-orm";
import type { Variables } from "../types/index.js";
import { getDb, schema } from "../db/index.js";

const { videos, users } = schema;

export const ogRoutes = new Hono<{ Variables: Variables }>();

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
