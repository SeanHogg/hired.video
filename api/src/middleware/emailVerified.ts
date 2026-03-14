import type { MiddlewareHandler } from "hono";
import type { Variables } from "../types/index.js";

export const emailVerifiedMiddleware: MiddlewareHandler<{ Variables: Variables }> = async (c, next) => {
  const user = c.var.user;
  if (!user?.emailVerified) {
    return c.json(
      { error: { code: "EMAIL_NOT_VERIFIED", message: "Email address must be verified before accessing this resource." } },
      403,
    );
  }
  return next();
};
