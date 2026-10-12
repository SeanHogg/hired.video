/**
 * SuperAdmin usage / presence (#2045-2046). Mounted at /api/admin/usage.
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
 */
import { Hono } from "hono";
import type { AppEnv } from "../types/index.js";
import { success, error } from "../types/index.js";
import { getDb, schema } from "../db/index.js";
import { buildRepos } from "../repositories/index.js";
import { superAdminMiddleware } from "../middleware/superAdmin.js";
import { UsageService } from "../services/usage/UsageService.js";
import { UsageReportService } from "../services/usage/UsageReportService.js";
import { isManageableRole } from "../../../shared/role-access.js";
import { toTrafficWindow } from "../../../shared/usage.js";
import { getOrSetCached } from "../utils/edge-cache.js";

const { adminAuditLog } = schema;

export const adminUsageRoutes = new Hono<AppEnv>();

adminUsageRoutes.use("*", superAdminMiddleware);

function buildService() {
  return new UsageService(buildRepos(getDb()).usageTracking);
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
  return new UsageReportService(buildRepos(getDb()).usageTracking);
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
  const report = await getOrSetCached({
    key: `obs:api-health:${route ?? "*"}`,
    ttlSeconds: 60,
    loader: () => buildRepos(getDb()).observability.apiHealthReport(new Date(), { route }),
  });
  return c.json(success(report), 200);
});

adminUsageRoutes.delete("/visitor/:visitorId", async (c) => {
  const visitorId = c.req.param("visitorId");
  const removed = await buildService().eraseForVisitor(visitorId);
  await getDb()
    .insert(adminAuditLog)
    .values({
      actorId: c.var.user?.sub as string,
      action: "usage.dsr_erase",
      targetType: "usage_visitor",
      targetId: visitorId,
      metadata: { removed },
    } as any)
    .catch(() => undefined);
  return c.json(success({ visitorId, removed }), 200);
});

export default adminUsageRoutes;
