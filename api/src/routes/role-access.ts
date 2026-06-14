/**
 * Role access manifest (read) — the per-role, SuperAdmin-curated set of
 * navigation items / features a viewer should see. Mounted at
 * /api/role-access. Every menu/feature gate self-consumes this (via the
 * frontend useRoleAccess hook) so visibility lives in one place (#2037).
 *
 * Authenticated: the role comes from the viewer's JWT. A SuperAdmin may pass
 * ?role=<role> to preview another role's manifest (used by the curation page
 * + Preview-as-role); non-SA callers always get their own role.
 *
 * Returns the role's raw override deltas; the client resolves them against its
 * combined registry (shared nav surfaces + tool surfaces from the catalog) via
 * the shared resolver, so tools and nav share one truth. Read-through cached
 * per role in RoleAccessService.
 */
import { Hono } from "hono";
import type { AppEnv } from "../types/index.js";
import { success } from "../types/index.js";
import { getDb } from "../db/index.js";
import { buildRepos } from "../repositories/index.js";
import { RoleAccessService } from "../services/admin/RoleAccessService.js";
import { isSuperAdmin } from "../middleware/superAdmin.js";
import { resolveAccessRole, isManageableRole } from "../../../shared/role-access.js";

export const roleAccessRoutes = new Hono<AppEnv>();

roleAccessRoutes.get("/me", async (c) => {
  const viewerRole = resolveAccessRole(c.var.user?.roles);

  // SA-only role preview — renders exactly what each role's app shows without
  // a full impersonation session (drives Preview-as-role on the curation page).
  const requested = c.req.query("role");
  const role =
    requested && isSuperAdmin(c.var.user) && isManageableRole(requested)
      ? requested
      : viewerRole;

  const service = new RoleAccessService(buildRepos(getDb()).roleFeatureAccess);
  const overrides = await service.getOverridesForRole(role);
  return c.json(success({ role, overrides }), 200);
});

export default roleAccessRoutes;
