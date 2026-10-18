import type { MiddlewareHandler } from "hono";
import type { Variables, AppEnv } from "../types/index.js";
import { error } from "../types/index.js";

export const passwordChangeMiddleware: MiddlewareHandler<AppEnv> = async (c, next) => {
  const user = c.var.user;
  if (user?.mustChangePassword) {
    return c.json(
      error("PASSWORD_CHANGE_REQUIRED", "You must change your password before continuing."),
      403,
    );
  }
  return next();
};
