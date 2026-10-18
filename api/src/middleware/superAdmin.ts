import type { MiddlewareHandler } from "hono";
import type { JwtPayload, Variables, AppEnv } from "../types/index.js";
import { error } from "../types/index.js";
import { USER_ROLES } from "../../../shared/user-roles.js";

/**
 * Strict SuperAdmin predicate against the JWT payload. Use this anywhere
 * a route or service needs an inline check (and `superAdminMiddleware`
 * is the wrong shape — e.g. a route that responds differently for SA vs
 * everyone else rather than 403'ing). Note: this is intentionally
 * stricter than `isAdminRole` below, which also lets regular Admin through.
 */
export function isSuperAdmin(user: JwtPayload | null | undefined): boolean {
  if (!user) return false;
  return user.isSuperAdmin === true || user.roles?.includes(USER_ROLES.SUPER_ADMIN) === true;
}

/**
 * Internal-staff predicate: SuperAdmin OR Admin, honouring every shape a
 * JWT carries (the `roles` array, a legacy singular `role`, and the
 * `isSuperAdmin` claim). The ONE implementation — gates that bypass billing,
 * module toggles or People-Ops scoping for internal users call this.
 */
export function isAdminRole(user: JwtPayload | null | undefined): boolean {
  if (!user) return false;
  if (isSuperAdmin(user)) return true;
  const roles = user.roles ?? [];
  const role = (user as { role?: string }).role ?? "";
  return (
    roles.includes(USER_ROLES.ADMIN) ||
    role === USER_ROLES.SUPER_ADMIN ||
    role === USER_ROLES.ADMIN
  );
}

/**
 * Single chokepoint for honoring (or silently dropping) a client-supplied
 * model id on an LLM-calling route. End users must never be able to pick
 * which vendor / model serves their request — that's a SuperAdmin-only
 * affordance. Any route that accepts a `model` field on its request body
 * MUST run the value through this helper before passing it down to the
 * LLM helper. Non-SA callers get `undefined` back, which causes the LLM
 * helper to fall through to its server-chosen default.
 *
 * Note: the actual model used IS still recorded by `recordTokenUsage`
 * for SuperAdmin audit — gating happens on the request side, not the
 * audit side.
 */
export function pickModelForCaller(
  user: JwtPayload | null | undefined,
  requestedModel: string | undefined,
): string | undefined {
  return isSuperAdmin(user) ? requestedModel : undefined;
}

/**
 * Requires the authenticated user to be a SuperAdmin.
 * Checks both the isSuperAdmin JWT claim and the roles array.
 * Must run after authMiddleware.
 */
export const superAdminMiddleware: MiddlewareHandler<AppEnv> = async (c, next) => {
  const user = c.var.user;
  if (!user) {
    return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  }

  if (!isSuperAdmin(user)) {
    return c.json(error("FORBIDDEN", "SuperAdmin access required"), 403);
  }

  // Block impersonation tokens from hitting superadmin endpoints
  if (user.emu === true) {
    return c.json(error("FORBIDDEN", "Impersonation tokens cannot access SuperAdmin endpoints"), 403);
  }

  return next();
};

/**
 * Requires the authenticated user to be internal staff (Admin or
 * SuperAdmin — see `isAdminRole`). Must run after authMiddleware. Replaces
 * the per-route `requireAdmin` clones.
 */
export const adminMiddleware: MiddlewareHandler<AppEnv> = async (c, next) => {
  const user = c.var.user;
  if (!user) {
    return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  }
  if (!isAdminRole(user)) {
    return c.json(error("FORBIDDEN", "Admin role required"), 403);
  }
  return next();
};
