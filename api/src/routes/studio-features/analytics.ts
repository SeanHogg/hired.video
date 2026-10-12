/**
 * Studio features — advanced video analytics (heatmap). Mounted at /api/studio through the
 * routes/studio-features.ts barrel (split out of that file; paths unchanged).
 */
import { Hono } from "hono";
import { eq, desc } from "drizzle-orm";
import { z } from "zod";
import { UuidLikeSchema } from "../../../../shared/validation.js";
import type { AppEnv } from "../../types/index.js";
import { getDb, schema } from "../../db/index.js";
import { requireVideoAnalytics } from "../../middleware/tierEnforcement.js";
import { recordArtifactView } from "../../services/analytics/artifactView.js";
import { ok, fail, studioVideoHeatmap } from "./shared.js";

export const analyticsRoutes = new Hono<AppEnv>();

// ═══════════════════════════════════════════════════════════════════════════════
// ██  11. ADVANCED VIDEO ANALYTICS (Wistia-quality heatmap)
// ═══════════════════════════════════════════════════════════════════════════════

// POST /api/studio/analytics/track — track per-second viewing data (public)
analyticsRoutes.post("/analytics/track", async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = z.object({
    projectId: UuidLikeSchema,
    viewerId: z.string().optional(),
    viewerEmail: z.string().email().optional(),
    secondsWatched: z.array(z.number()),     // array of 0|1 per second
    totalWatchTimeSec: z.number(),
    percentWatched: z.number(),
    dropOffSecond: z.number().optional(),
    referrer: z.string().optional(),
    userAgent: z.string().optional(),
  }).safeParse(body);

  if (!parsed.success) return c.json(fail("VALIDATION_ERROR", "Invalid request"), 400);

  // Reverse-lookup company from email domain
  let viewerCompany: string | null = null;
  if (parsed.data.viewerEmail) {
    const domain = parsed.data.viewerEmail.split("@")[1];
    if (domain && !["gmail.com", "yahoo.com", "hotmail.com", "outlook.com", "icloud.com"].includes(domain)) {
      viewerCompany = domain.split(".")[0].charAt(0).toUpperCase() + domain.split(".")[0].slice(1);
    }
  }

  // Cloudflare's edge resolves the viewer's country from the request IP
  // and lands it in `cf-ipcountry`. Same pattern as the form-submission
  // handler (line 2807) — see also services/auth/geo.ts for the wider
  // detectCountry() helper used by signup gating. "XX" / "T1" are
  // Cloudflare sentinels meaning "unknown" (Tor exit etc.) and should
  // not be stored as if they were a real country.
  const ipCountryRaw = c.req.header("cf-ipcountry") ?? null;
  const ipCountry = ipCountryRaw && ipCountryRaw !== "XX" && ipCountryRaw !== "T1"
    ? ipCountryRaw.toUpperCase()
    : null;

  const db = getDb();
  const [heatmap] = await db.insert(studioVideoHeatmap).values({
    studioProjectId: parsed.data.projectId,
    viewerId: parsed.data.viewerId ?? null,
    viewerEmail: parsed.data.viewerEmail ?? null,
    viewerCompany,
    secondsWatched: parsed.data.secondsWatched,
    totalWatchTimeSec: parsed.data.totalWatchTimeSec,
    percentWatched: parsed.data.percentWatched,
    dropOffSecond: parsed.data.dropOffSecond ?? null,
    referrer: parsed.data.referrer ?? null,
    userAgent: parsed.data.userAgent ?? null,
    ipCountry,
  } as any).returning();

  // Dual-write to artifact_views for the unified creator-stats rollup
  // (Gap Register #1019). Owner lookup is best-effort — if the project
  // was deleted between event and persist, we still record an anonymous
  // view without the owner stamp.
  const [project] = await db
    .select({ userId: schema.studioProjects.userId })
    .from(schema.studioProjects)
    .where(eq(schema.studioProjects.id, parsed.data.projectId))
    .limit(1);
  await recordArtifactView({
    artifactKind: "video",
    artifactId: parsed.data.projectId,
    ownerUserId: project?.userId ?? null,
    viewerId: parsed.data.viewerId && /^[0-9a-f-]{36}$/i.test(parsed.data.viewerId)
      ? parsed.data.viewerId
      : null,
    viewerEmail: parsed.data.viewerEmail ?? null,
    viewerCompany,
    ipCountry,
    referrer: parsed.data.referrer ?? null,
    userAgent: parsed.data.userAgent ?? null,
    engagement: parsed.data.secondsWatched,
    engagementUnit: "s",
    totalEngagementSec: parsed.data.totalWatchTimeSec,
    percentConsumed: parsed.data.percentWatched / 100,
    dropOffBucket: parsed.data.dropOffSecond ?? null,
  });

  return c.json(ok({ id: heatmap.id }), 201);
});

// GET /api/studio/analytics/projects/:projectId — heatmap + drop-off +
// viewer-company breakdown. Pro-gated via the shared `requireVideoAnalytics`
// middleware (paired with `studio.ts /projects/:id/analytics`). POST
// /analytics/track stays public so anonymous viewers can record events.
analyticsRoutes.get("/analytics/projects/:projectId", requireVideoAnalytics, async (c) => {
  const user = c.var.user;
  const projectId = c.req.param("projectId");
  const db = getDb();

  const views = await db.select().from(studioVideoHeatmap)
    .where(eq(studioVideoHeatmap.studioProjectId, projectId))
    .orderBy(desc(studioVideoHeatmap.createdAt))
    .limit(500);

  if (views.length === 0) {
    return c.json(ok({
      totalViews: 0,
      avgWatchTimeSec: 0,
      avgPercentWatched: 0,
      heatmap: [],
      viewers: [],
      topDropOffSecond: null,
      referrers: [],
      countries: [],
    }));
  }

  // Build aggregated heatmap (per-second view count)
  const maxDuration = Math.max(...views.map((v) => {
    const sw = v.secondsWatched as number[];
    return sw?.length ?? 0;
  }));
  const heatmap = new Array(maxDuration).fill(0);
  for (const view of views) {
    const sw = view.secondsWatched as number[];
    if (sw) {
      for (let i = 0; i < sw.length; i++) {
        if (sw[i]) heatmap[i] = (heatmap[i] ?? 0) + 1;
      }
    }
  }

  // Normalize heatmap to percentages
  const totalViews = views.length;
  const normalizedHeatmap = heatmap.map((count: number) =>
    Math.round((count / totalViews) * 100),
  );

  const avgWatchTimeSec = Math.round(views.reduce((a, v) => a + (v.totalWatchTimeSec ?? 0), 0) / totalViews);
  const avgPercentWatched = Math.round(views.reduce((a, v) => a + (v.percentWatched ?? 0), 0) / totalViews);

  // Find most common drop-off point
  const dropOffs: Record<number, number> = {};
  for (const view of views) {
    if (view.dropOffSecond != null) {
      dropOffs[view.dropOffSecond] = (dropOffs[view.dropOffSecond] ?? 0) + 1;
    }
  }
  const topDropOffSecond = Object.entries(dropOffs)
    .sort(([, a], [, b]) => b - a)[0]?.[0] ?? null;

  // Viewer list (deduplicated, most recent first)
  const viewerMap = new Map<string, { email?: string; company?: string; lastViewed: string; views: number; avgPercent: number }>();
  for (const view of views) {
    const key = view.viewerEmail ?? view.viewerId ?? "anonymous";
    const existing = viewerMap.get(key);
    if (existing) {
      existing.views += 1;
      existing.avgPercent = Math.round((existing.avgPercent * (existing.views - 1) + (view.percentWatched ?? 0)) / existing.views);
    } else {
      viewerMap.set(key, {
        email: view.viewerEmail ?? undefined,
        company: view.viewerCompany ?? undefined,
        lastViewed: view.createdAt?.toISOString() ?? new Date().toISOString(),
        views: 1,
        avgPercent: Math.round(view.percentWatched ?? 0),
      });
    }
  }

  // Traffic-source rollup keyed on document.referrer captured at view
  // time. Bare hostname is what the dashboard chart needs — strip
  // protocol/path so "https://linkedin.com/feed/abc" + "linkedin.com/in/foo"
  // collapse into one "linkedin.com" bar. Empty/null referrers
  // (direct visits, opaque referrer policy, in-app navigation) land in
  // the "Direct" bucket so the chart always sums to totalViews.
  const referrerCounts = new Map<string, number>();
  for (const view of views) {
    const raw = view.referrer?.trim();
    let source = "Direct";
    if (raw) {
      try {
        source = new URL(raw).hostname.replace(/^www\./, "");
      } catch {
        source = raw.slice(0, 100);
      }
    }
    referrerCounts.set(source, (referrerCounts.get(source) ?? 0) + 1);
  }
  const referrers = Array.from(referrerCounts.entries())
    .map(([source, count]) => ({ source, views: count }))
    .sort((a, b) => b.views - a.views);

  // Country rollup from the `cf-ipcountry` header captured at view time.
  // Rows pre-deploy (or with header stripped by an intermediate proxy)
  // have a null `ipCountry` and land in the "Unknown" bucket so the chart
  // continues to sum to totalViews. ISO-3166 alpha-2 codes are uppercased
  // at insert time, so we can safely group on the raw column value here.
  const countryCounts = new Map<string, number>();
  for (const view of views) {
    const code = view.ipCountry ?? "ZZ"; // ZZ = "Unknown" sentinel (not a real ISO-3166 code)
    countryCounts.set(code, (countryCounts.get(code) ?? 0) + 1);
  }
  const countries = Array.from(countryCounts.entries())
    .map(([country, count]) => ({ country, views: count }))
    .sort((a, b) => b.views - a.views);

  return c.json(ok({
    totalViews,
    avgWatchTimeSec,
    avgPercentWatched,
    heatmap: normalizedHeatmap,
    topDropOffSecond: topDropOffSecond ? Number(topDropOffSecond) : null,
    viewers: Array.from(viewerMap.entries())
      .map(([key, data]) => ({ id: key, ...data }))
      .sort((a, b) => b.views - a.views)
      .slice(0, 50),
    referrers,
    countries,
  }));
});
