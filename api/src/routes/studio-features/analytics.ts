/**
 * Studio features — advanced video analytics (heatmap). Mounted at /api/studio through the
 * routes/studio-features.ts barrel (split out of that file; paths unchanged).
 * Use cases live in services/studio/video-heatmap.ts.
 */
import { Hono } from "hono";
import { z } from "zod";
import { UuidLikeSchema } from "../../../../shared/validation.js";
import type { AppEnv } from "../../types/index.js";
import { requireVideoAnalytics } from "../../middleware/tierEnforcement.js";
import { getHeatmapSummary, recordHeatmapView } from "../../services/studio/video-heatmap.js";
import { viewerCanActOnProject } from "./shared.js";
import { success, error } from "../../types/index.js";
import { validateJson } from "../helpers/validate.js";

export const analyticsRoutes = new Hono<AppEnv>();

// ═══════════════════════════════════════════════════════════════════════════════
// ██  11. ADVANCED VIDEO ANALYTICS (Wistia-quality heatmap)
// ═══════════════════════════════════════════════════════════════════════════════

// POST /api/studio/analytics/track — track per-second viewing data (public)
analyticsRoutes.post("/analytics/track", validateJson(z.object({
    projectId: UuidLikeSchema,
    viewerId: z.string().optional(),
    viewerEmail: z.string().email().optional(),
    secondsWatched: z.array(z.number()),     // array of 0|1 per second
    totalWatchTimeSec: z.number(),
    percentWatched: z.number(),
    dropOffSecond: z.number().optional(),
    referrer: z.string().optional(),
    userAgent: z.string().optional(),
  }), () => error("VALIDATION_ERROR", "Invalid request"), { emptyBody: null }), async (c) => {
  const body = c.req.valid("json");

  // Cloudflare's edge resolves the viewer's country from the request IP
  // and lands it in `cf-ipcountry`. "XX" / "T1" are Cloudflare sentinels
  // meaning "unknown" (Tor exit etc.) and are not stored as a real country.
  const ipCountryRaw = c.req.header("cf-ipcountry") ?? null;
  const ipCountry = ipCountryRaw && ipCountryRaw !== "XX" && ipCountryRaw !== "T1"
    ? ipCountryRaw.toUpperCase()
    : null;

  const id = await recordHeatmapView(body, ipCountry);
  return c.json(success({ id }), 201);
});

// GET /api/studio/analytics/projects/:projectId — heatmap + drop-off +
// viewer-company breakdown. Pro-gated via the shared `requireVideoAnalytics`
// middleware (paired with `studio.ts /projects/:id/analytics`). POST
// /analytics/track stays public so anonymous viewers can record events.
// Viewer emails/companies are private to whoever may act on the project
// (owner / company member / delegate); anything else answers 404.
analyticsRoutes.get("/analytics/projects/:projectId", requireVideoAnalytics, async (c) => {
  const projectId = c.req.param("projectId");
  if (!(await viewerCanActOnProject(c.var.userId, projectId))) {
    return c.json(error("NOT_FOUND", "Project not found"), 404);
  }
  return c.json(success(await getHeatmapSummary(projectId)));
});
