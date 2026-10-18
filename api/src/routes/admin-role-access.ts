/**
 * SuperAdmin per-role feature & navigation access curation. Mounted at
 * /api/admin/role-access.
 *
 * Lets a SuperAdmin set, per role, which navigation items / features are
 * visible (and, where enforced, enabled), reorder, and reset a role to its
 * registry defaults — the lever behind the "app feels too complex" gap
 * (#1995/#2036). Every mutation is audit-logged and invalidates the affected
 * role's read cache (inside RoleAccessService).
 *
 * Routes:
 *   GET    /api/admin/role-access        — { registry, overrides } for the UI
 *   POST   /api/admin/role-access        — upsert one (role, feature) override
 *   DELETE /api/admin/role-access/:role  — reset a role to defaults
 */
import { Hono } from "hono";
import type { AppEnv } from "../types/index.js";
import { success, error } from "../types/index.js";
import { adminRepos } from "../repositories/admin/index.js";
import { recordAdminAudit } from "../services/admin/adminAudit.js";
import { RoleAccessService } from "../services/admin/RoleAccessService.js";
import { UpsertRoleAccessSchema } from "../../../shared/role-access.js";
import { validateJson } from "./helpers/validate.js";

export const adminRoleAccessRoutes = new Hono<AppEnv>();

function buildService() {
  return new RoleAccessService(adminRepos().roleFeatureAccess);
}

function audit(actorId: string, action: string, targetId: string, metadata: Record<string, unknown>) {
  return recordAdminAudit({ actorId, action, targetType: "role", targetId, metadata });
}

// ---------------------------------------------------------------------------
// GET / — every stored override. The admin page resolves each role's manifest
// client-side with the shared resolver over its COMBINED registry (shared nav
// surfaces + tool surfaces derived from the frontend catalog), so the registry
// itself is owned client-side and not re-sent here.
// ---------------------------------------------------------------------------
adminRoleAccessRoutes.get("/", async (c) => {
  const overrides = await buildService().listOverridesForAdmin();
  return c.json(success({ overrides }), 200);
});

// ---------------------------------------------------------------------------
// POST / — upsert one (role, feature) override.
// ---------------------------------------------------------------------------
adminRoleAccessRoutes.post("/", validateJson(UpsertRoleAccessSchema, (e) => error("VALIDATION_ERROR", e.issues[0]?.message ?? "Invalid body")), async (c) => {
  const body = c.req.valid("json");
  const actorId = c.var.userId;
  const row = await buildService().upsert(body, actorId);
  await audit(actorId, "role_access.upsert", body.role, {
    featureKey: body.featureKey,
    visible: body.visible ?? null,
    enabled: body.enabled ?? null,
    rank: body.rank ?? null,
  });
  return c.json(success(row), 200);
});

// ---------------------------------------------------------------------------
// DELETE /:role — reset a role to its registry defaults.
// ---------------------------------------------------------------------------
adminRoleAccessRoutes.delete("/:role", async (c) => {
  const role = c.req.param("role");
  const actorId = c.var.userId;
  const removed = await buildService().resetRole(role);
  await audit(actorId, "role_access.reset", role, { removed });
  return c.json(success({ role, removed }), 200);
});

export default adminRoleAccessRoutes;
