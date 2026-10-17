import { Hono } from "hono";
import type { AppEnv } from "../../types/index.js";
import { userMgmtRoutes } from "./users.js";
import { moduleRoutes } from "./modules.js";
import { auditRoutes } from "./audit.js";
import { securityRoutes } from "./security.js";
import { aiVendorRoutes } from "./ai-vendors.js";
import { aiSpendRoutes } from "./ai-spend.js";
import { extensionTelemetryRoutes } from "./extension.js";
import { superadminPointsRoutes } from "./points.js";
import { superadminCompanyRoutes } from "./companies.js";

/**
 * SuperAdmin console router — mounted at /api/admin/sa by the admin
 * composite (routes/admin/index.ts), which applies superAdminMiddleware once.
 * Impersonation sessions live separately at /api/admin/impersonate
 * (sessions.ts); tool-usage insights live under /api/admin/usage/tools.
 *
 *   /users       → cross-tenant user management  (users.ts)
 *   /modules     → module CRUD  (modules.ts)
 *   /audit       → audit log viewer  (audit.ts)
 *   /security    → signup spam / abuse investigation  (security.ts)
 *   /ai          → AI use-case + gateway visibility  (ai-vendors.ts)
 *   /ai-spend    → AI spend vs revenue + cost reconciliation  (ai-spend.ts)
 *   /extension   → extension telemetry  (extension.ts)
 *   /points      → gamification admin  (points.ts)
 *   /companies   → company management  (companies.ts)
 */
export const superadminRoutes = new Hono<AppEnv>();

superadminRoutes.route("/users", userMgmtRoutes);
superadminRoutes.route("/modules", moduleRoutes);
superadminRoutes.route("/audit", auditRoutes);
superadminRoutes.route("/security", securityRoutes);
superadminRoutes.route("/ai", aiVendorRoutes);
superadminRoutes.route("/ai-spend", aiSpendRoutes);
superadminRoutes.route("/extension", extensionTelemetryRoutes);
superadminRoutes.route("/points", superadminPointsRoutes);
superadminRoutes.route("/companies", superadminCompanyRoutes);
