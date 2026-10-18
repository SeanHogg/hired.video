/**
 * Studio project analytics (W2-3a split of routes/studio.ts), keyed on the
 * project post-#665 (migration 0085):
 *   POST /api/studio/projects/:projectId/view      — record a view (public, 202)
 *   POST /api/studio/projects/:projectId/cta-click — record a CTA click (public, 202)
 *   GET  /api/studio/projects/:projectId/analytics — owner summary (requireVideoAnalytics)
 */
import { Hono, type Context } from "hono";
import type { AppEnv } from "../../types/index.js";
import { requireVideoAnalytics } from "../../middleware/tierEnforcement.js";
import {
  getProjectAnalytics,
  trackProjectEvent,
  type TrackedProjectEvent,
} from "../../services/studio/project-analytics.js";
import { success } from "../../types/index.js";
import { requireUser } from "../helpers/routerHelpers.js";

export const studioProjectAnalyticsRoutes = new Hono<AppEnv>();

async function track(c: Context<AppEnv>, event: TrackedProjectEvent): Promise<Response> {
  const body: unknown = await c.req.json().catch(() => ({}));
  const fields = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  await trackProjectEvent(c.req.param("projectId"), event, c.var.userId ?? null, fields);
  return c.json(success({ tracked: true }), 202);
}

studioProjectAnalyticsRoutes.post("/projects/:projectId/view", (c) => track(c, "view"));
studioProjectAnalyticsRoutes.post("/projects/:projectId/cta-click", (c) => track(c, "cta_click"));

// Pro-gated (paired with studio-features.ts /analytics/projects/:projectId):
// CTA clicks + shares + CTR. Free users get view counts via GET /projects.
studioProjectAnalyticsRoutes.get("/projects/:projectId/analytics", requireVideoAnalytics, async (c) => {
  const userId = requireUser(c);
  return c.json(success(await getProjectAnalytics(userId, c.req.param("projectId"))));
});
