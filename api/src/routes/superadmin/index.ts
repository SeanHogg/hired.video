import { Hono } from "hono";
import type { Variables } from "../../types/index.js";
import { superAdminMiddleware } from "../../middleware/superAdmin.js";
import { sessionRoutes } from "./sessions.js";
import { userMgmtRoutes } from "./users.js";
import { moduleRoutes } from "./modules.js";
import { auditRoutes } from "./audit.js";
import { toolUsageRoutes } from "./tool-usage.js";
import { securityRoutes } from "./security.js";
import { aiVendorRoutes } from "./ai-vendors.js";
import { extensionTelemetryRoutes } from "./extension.js";
import { superadminPointsRoutes } from "./points.js";

/**
 * SuperAdmin management router.
 *
 * Mounted at /api/admin/impersonate in app.ts. Sub-routers:
 *   /               → session lifecycle  (sessions.ts)
 *   /users          → cross-tenant user management  (users.ts)
 *   /modules        → module CRUD  (modules.ts)
 *   /audit          → audit log viewer  (audit.ts)
 *   /security       → spam / abuse investigation  (security.ts)
 *
 * superAdminMiddleware is applied once here — sub-routers do not repeat it.
 */
export const superadminRoutes = new Hono<{ Variables: Variables }>();

superadminRoutes.use("*", superAdminMiddleware);

superadminRoutes.route("/", sessionRoutes);
superadminRoutes.route("/users", userMgmtRoutes);
superadminRoutes.route("/modules", moduleRoutes);
superadminRoutes.route("/audit", auditRoutes);
superadminRoutes.route("/tool-usage", toolUsageRoutes);
superadminRoutes.route("/security", securityRoutes);
superadminRoutes.route("/ai", aiVendorRoutes);
superadminRoutes.route("/extension", extensionTelemetryRoutes);
superadminRoutes.route("/points", superadminPointsRoutes);
