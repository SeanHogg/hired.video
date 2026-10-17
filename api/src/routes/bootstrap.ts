// /api/bootstrap — the post-login / page-refresh aggregate (gaps #1367/#1368).
// Thin adapter: the slices + their contract live in services/bootstrap.

import { Hono } from "hono";
import type { AppEnv } from "../types/index.js";
import { error, success } from "../types/index.js";
import { isSuperAdmin } from "../middleware/superAdmin.js";
import { gamificationFromContext } from "../domains/gamification/with-gamification.js";
import { buildBootstrap } from "../services/bootstrap/bootstrapService.js";

export const bootstrapRoutes = new Hono<AppEnv>();

bootstrapRoutes.get("/", async (c) => {
  const user = c.var.user;
  const userId = user?.sub;
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);

  const payload = await buildBootstrap(
    { userId, roles: user.roles ?? [], isSuperAdmin: isSuperAdmin(user) },
    { gamification: () => gamificationFromContext(c) },
  );
  return c.json(success(payload), 200);
});
