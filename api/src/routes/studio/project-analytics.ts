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
import { fail, ok, studioErrorResponse } from "./http.js";

export const studioProjectAnalyticsRoutes = new Hono<AppEnv>();

async function track(c: Context<AppEnv>, event: TrackedProjectEvent): Promise<Response> {
  const body: unknown = await c.req.json().catch(() => ({}));
  const fields = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  await trackProjectEvent(c.req.param("projectId"), event, c.var.user?.sub ?? null, fields);
  return c.json(ok({ tracked: true }), 202);
}

studioProjectAnalyticsRoutes.post("/projects/:projectId/view", (c) => track(c, "view"));
studioProjectAnalyticsRoutes.post("/projects/:projectId/cta-click", (c) => track(c, "cta_click"));

// Pro-gated (paired with studio-features.ts /analytics/projects/:projectId):
// CTA clicks + shares + CTR. Free users get view counts via GET /projects.
studioProjectAnalyticsRoutes.get("/projects/:projectId/analytics", requireVideoAnalytics, async (c) => {
  const userId = c.var.user?.sub;
  if (!userId) return c.json(fail("UNAUTHORIZED", "Authentication required"), 401);
  try {
    return c.json(ok(await getProjectAnalytics(userId, c.req.param("projectId"))));
  } catch (e) {
    return studioErrorResponse(c, e);
  }
});
