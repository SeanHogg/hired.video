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
import { getDb, schema } from "../db/index.js";
import { buildRepos } from "../repositories/index.js";
import { superAdminMiddleware } from "../middleware/superAdmin.js";
import {
  RoleAccessService,
  RoleAccessError,
} from "../services/admin/RoleAccessService.js";
import { UpsertRoleAccessSchema } from "../../../shared/role-access.js";
import { FEATURE_REGISTRY } from "../../../shared/feature-registry.js";

const { adminAuditLog } = schema;

export const adminRoleAccessRoutes = new Hono<AppEnv>();

adminRoleAccessRoutes.use("*", superAdminMiddleware);

function buildService() {
  return new RoleAccessService(buildRepos(getDb()).roleFeatureAccess);
}

async function audit(
  actorId: string,
  action: string,
  targetId: string,
  metadata: Record<string, unknown>,
) {
  await getDb()
    .insert(adminAuditLog)
    .values({
      actorId,
      action,
      targetType: "role",
      targetId,
      metadata,
    } as any)
    .catch(() => undefined);
}

// ---------------------------------------------------------------------------
// GET / — the registry catalog + every stored override (the admin resolves
// each role's manifest client-side with the shared resolver).
// ---------------------------------------------------------------------------
adminRoleAccessRoutes.get("/", async (c) => {
  const overrides = await buildService().listOverridesForAdmin();
  return c.json(success({ registry: FEATURE_REGISTRY, overrides }), 200);
});

// ---------------------------------------------------------------------------
// POST / — upsert one (role, feature) override.
// ---------------------------------------------------------------------------
adminRoleAccessRoutes.post("/", async (c) => {
  const parsed = UpsertRoleAccessSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) {
    return c.json(error("VALIDATION_ERROR", parsed.error.issues[0]?.message ?? "Invalid body"), 400);
  }
  const actorId = c.var.user?.sub as string;
  try {
    const row = await buildService().upsert(parsed.data, actorId);
    await audit(actorId, "role_access.upsert", parsed.data.role, {
      featureKey: parsed.data.featureKey,
      visible: parsed.data.visible ?? null,
      enabled: parsed.data.enabled ?? null,
      rank: parsed.data.rank ?? null,
    });
    return c.json(success(row), 200);
  } catch (e) {
    if (e instanceof RoleAccessError) {
      return c.json(error(e.code, e.message), 400);
    }
    throw e;
  }
});

// ---------------------------------------------------------------------------
// DELETE /:role — reset a role to its registry defaults.
// ---------------------------------------------------------------------------
adminRoleAccessRoutes.delete("/:role", async (c) => {
  const role = c.req.param("role");
  const actorId = c.var.user?.sub as string;
  try {
    const removed = await buildService().resetRole(role);
    await audit(actorId, "role_access.reset", role, { removed });
    return c.json(success({ role, removed }), 200);
  } catch (e) {
    if (e instanceof RoleAccessError) {
      return c.json(error(e.code, e.message), 400);
    }
    throw e;
  }
});

export default adminRoleAccessRoutes;
