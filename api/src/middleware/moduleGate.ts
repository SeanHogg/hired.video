import type { Context, MiddlewareHandler } from "hono";
import type { Variables, AppEnv } from "../types/index.js";
import { getModuleStatusMap, isModuleActive } from "../services/auth/moduleStatus.js";
import { USER_ROLES } from "../../../shared/user-roles.js";
import { resolveAccessRole } from "../../../shared/role-access.js";
import { RoleAccessService } from "../services/admin/RoleAccessService.js";
import { buildRepos } from "../repositories/index.js";
import { getDb } from "../db/index.js";

type AppCtx = Context<AppEnv>;

// Role bypass — internal users always see every module, regardless of toggle.
// Same convention used by tierEnforcement.requirePro.
function isAdminRole(c: AppCtx): boolean {
  const roles = c.var.user?.roles ?? [];
  const role = (c.var.user as any)?.role ?? "";
  return (
    roles.includes(USER_ROLES.SUPER_ADMIN) ||
    roles.includes(USER_ROLES.ADMIN) ||
    role === USER_ROLES.SUPER_ADMIN ||
    role === USER_ROLES.ADMIN
  );
}

function forbidden(c: AppCtx, slug: string): Response {
  return c.json(
    {
      success: false,
      error: {
        code: "MODULE_DISABLED",
        message: `The "${slug}" module is currently disabled.`,
        slug,
      },
    },
    403,
  ) as Response;
}

/**
 * Route-level module gate. Use on a specific route or sub-router.
 *
 *   app.route("/api/ads", requireModuleActive("ads"), adsRoutes);
 *
 * Returns 403 MODULE_DISABLED when the named module exists and is inactive.
 * Passes through when the module is active, undefined (not curated), or when
 * the caller is an Admin / SuperAdmin.
 */
export function requireModuleActive(slug: string): MiddlewareHandler<AppEnv> {
  return async (c: AppCtx, next) => {
    if (isAdminRole(c)) return next();
    if (await isModuleActive(slug)) return next();
    return forbidden(c, slug);
  };
}

/**
 * Path-prefix gate. Use once globally with a registry so every /api/<prefix>
 * route inherits enforcement without having to touch each route file.
 *
 *   app.use("/api/*", moduleGateByPath({ "/api/ads": "ads", "/api/community": "community" }));
 *
 * The longest matching prefix wins (so "/api/ads/admin" can override "/api/ads").
 */
export function moduleGateByPath(
  registry: Record<string, string>,
): MiddlewareHandler<AppEnv> {
  const sorted = Object.keys(registry).sort((a, b) => b.length - a.length);
  return async (c: AppCtx, next) => {
    const path = c.req.path;
    const matched = sorted.find((p) => path === p || path.startsWith(p + "/"));
    if (!matched) return next();
    if (isAdminRole(c)) return next();
    const slug = registry[matched];

    // Global kill-switch (modules table) — disabled for everyone.
    const map = await getModuleStatusMap();
    if (map.get(slug) === false) return forbidden(c, slug);

    // Per-role disable (role_feature_access, #2039) — absorbs the global module
    // gate into the per-role manifest. Reads the role's cached overrides, so
    // this stays cheap on the hot path.
    const role = resolveAccessRole(c.var.user?.roles);
    const svc = new RoleAccessService(buildRepos(getDb()).roleFeatureAccess);
    if (!(await svc.isFeatureEnabledForRole(role, `module:${slug}`))) {
      return forbidden(c, slug);
    }
    return next();
  };
}
