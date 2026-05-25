/**
 * User-facing audit-log routes. Read-only; just exposes the unified
 * stream computed by services/audit/userAuditLog.ts. Lives at
 * /api/audit/me; mounted by app.ts behind authMiddleware.
 */

import { Hono } from "hono";
import type { Variables, AppEnv } from "../types/index.js";
import { error, success } from "../types/index.js";
import { fetchUserAuditEvents } from "../services/audit/userAuditLog.js";

export const userAuditRoutes = new Hono<AppEnv>();

userAuditRoutes.get("/me", async (c) => {
  const uid = (c.var.user?.sub as string | undefined) ?? null;
  if (!uid) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  const limit = Math.min(500, Math.max(1, Number(c.req.query("limit") ?? 100)));
  const events = await fetchUserAuditEvents(uid, limit);
  return c.json(success(events), 200);
});
