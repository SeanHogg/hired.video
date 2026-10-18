/**
 * SuperAdmin usage / presence (#2045-2046) — the ONE usage owner. Mounted at
 * /api/admin/usage by the admin composite (routes/admin/index.ts), which
 * applies the SA guard.
 *
 *   GET    /api/admin/usage/active            — "who is active now" (cached)
 *   GET    /api/admin/usage/feature-usage     — per-feature counts for ?role=
 *                                               (drives usage→access hints)
 *   GET    /api/admin/usage/traffic?days=     — visitors / signed-in / page views
 *                                               per day + top entry paths,
 *                                               referrers, UTM sources
 *   GET    /api/admin/usage/funnels/:id?days= — sequential funnel conversion
 *                                               (registry: shared/usage.ts)
 *   GET    /api/admin/usage/api-health?route= — per-route calls / errors /
 *                                               latency, errors by code +
 *                                               file:line, traffic per release,
 *                                               latest config snapshot
 *   DELETE /api/admin/usage/visitor/:visitorId — DSR erase of a visitor
 *   GET    /api/admin/usage/tools/*            — tool-run insights (admin/tool-usage.ts)
 */
import { Hono } from "hono";
import type { AppEnv } from "../types/index.js";
import { success, error } from "../types/index.js";
import { adminRepos } from "../repositories/admin/index.js";
import { recordAdminAudit } from "../services/admin/adminAudit.js";
import { toolUsageRoutes } from "./admin/tool-usage.js";
import { UsageService } from "../services/usage/UsageService.js";
import { UsageReportService } from "../services/usage/UsageReportService.js";
import { isManageableRole } from "../../../shared/role-access.js";
import { toTrafficWindow } from "../../../shared/usage.js";
import { getOrSetIsolateCached } from "../utils/isolate-cache.js";

export const adminUsageRoutes = new Hono<AppEnv>();

adminUsageRoutes.route("/tools", toolUsageRoutes);

function buildService() {
  return new UsageService(adminRepos().usageTracking);
}

adminUsageRoutes.get("/active", async (c) => {
  const sessions = await buildService().getActiveSessions();
  return c.json(success({ sessions }), 200);
});

adminUsageRoutes.get("/feature-usage", async (c) => {
  const role = c.req.query("role");
  if (!role || !isManageableRole(role)) {
    return c.json(success({ usage: {} }), 200);
  }
  const usage = await buildService().getFeatureUsageForRole(role);
  return c.json(success({ role, usage }), 200);
});

function buildReports() {
  return new UsageReportService(adminRepos().usageTracking);
}

adminUsageRoutes.get("/traffic", async (c) => {
  const report = await buildReports().getTraffic(toTrafficWindow(c.req.query("days")));
  return c.json(success(report), 200);
});

adminUsageRoutes.get("/funnels/:id", async (c) => {
  const report = await buildReports().getFunnel(c.req.param("id"), toTrafficWindow(c.req.query("days")));
  if (!report) return c.json(error("NOT_FOUND", "Unknown funnel"), 404);
  return c.json(success(report), 200);
});

// API health from request_logs (30 days). Cached 60s: it scans the window
// and is read rarely. ?route=/api/resumes/:id narrows the route sections.
adminUsageRoutes.get("/api-health", async (c) => {
  const route = c.req.query("route")?.slice(0, 255) || undefined;
  const report = await getOrSetIsolateCached({
    key: `obs:api-health:${route ?? "*"}`,
    ttlSeconds: 60,
    loader: () => adminRepos().observability.apiHealthReport(new Date(), { route }),
  });
  return c.json(success(report), 200);
});

adminUsageRoutes.delete("/visitor/:visitorId", async (c) => {
  const visitorId = c.req.param("visitorId");
  const removed = await buildService().eraseForVisitor(visitorId);
  await recordAdminAudit({
    actorId: c.var.userId,
    action: "usage.dsr_erase",
    targetType: "usage_visitor",
    targetId: visitorId,
    metadata: { removed },
  });
  return c.json(success({ visitorId, removed }), 200);
});

export default adminUsageRoutes;
