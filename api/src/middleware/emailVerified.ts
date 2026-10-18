import type { MiddlewareHandler } from "hono";
import type { Variables, AppEnv } from "../types/index.js";
import { error } from "../types/index.js";

export const emailVerifiedMiddleware: MiddlewareHandler<AppEnv> = async (c, next) => {
  const user = c.var.user;
  // Guest accounts have no email to verify; they are scoped by being a
  // guest (download needs a real account).
  if (!user?.emailVerified && !user?.guest) {
    return c.json(
      error("EMAIL_NOT_VERIFIED", "Email address must be verified before accessing this resource."),
      403,
    );
  }
  return next();
};
