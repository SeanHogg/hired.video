import type { MiddlewareHandler } from "hono";
import type { Variables } from "../types/index.js";
import { USER_ROLES } from "../../../shared/user-roles.js";

/**
 * Requires the authenticated user to be a SuperAdmin.
 * Checks both the isSuperAdmin JWT claim and the roles array.
 * Must run after authMiddleware.
 */
export const superAdminMiddleware: MiddlewareHandler<{ Variables: Variables }> = async (c, next) => {
  const user = c.var.user;
  if (!user) {
    return c.json({ error: { code: "UNAUTHORIZED", message: "Authentication required" } }, 401);
  }

  const isSuperAdmin =
    user.isSuperAdmin === true ||
    user.roles?.includes(USER_ROLES.SUPER_ADMIN);

  if (!isSuperAdmin) {
    return c.json({ error: { code: "FORBIDDEN", message: "SuperAdmin access required" } }, 403);
  }

  // Block impersonation tokens from hitting superadmin endpoints
  if (user.emu === true) {
    return c.json({ error: { code: "FORBIDDEN", message: "Impersonation tokens cannot access SuperAdmin endpoints" } }, 403);
  }

  return next();
};
