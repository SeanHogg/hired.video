/**
 * SuperAdmin usage / presence (#2045-2046). Mounted at /api/admin/usage.
 *
 *   GET    /api/admin/usage/active            — "who is active now" (cached)
 *   GET    /api/admin/usage/feature-usage     — per-feature counts for ?role=
 *                                               (drives usage→access hints)
 *   DELETE /api/admin/usage/visitor/:visitorId — DSR erase of a visitor
 */
import { Hono } from "hono";
import type { AppEnv } from "../types/index.js";
import { success } from "../types/index.js";
import { getDb, schema } from "../db/index.js";
import { buildRepos } from "../repositories/index.js";
import { superAdminMiddleware } from "../middleware/superAdmin.js";
import { UsageService } from "../services/usage/UsageService.js";
import { isManageableRole } from "../../../shared/role-access.js";

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
