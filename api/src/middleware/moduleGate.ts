import type { Context, MiddlewareHandler } from "hono";
import type { Variables, AppEnv } from "../types/index.js";
import { getModuleStatusMap, isModuleActive } from "../services/auth/moduleStatus.js";
import { USER_ROLES } from "../../../shared/user-roles.js";

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
    const map = await getModuleStatusMap();
    const status = map.get(slug);
    if (status === false) return forbidden(c, slug);
    return next();
  };
}
