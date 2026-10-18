/**
 * User-facing audit-log routes. Read-only; just exposes the unified
 * stream computed by services/audit/userAuditLog.ts. Lives at
 * /api/audit/me; mounted by app.ts behind authMiddleware.
 */

import { Hono } from "hono";
import type { Variables, AppEnv } from "../types/index.js";
import { success } from "../types/index.js";
import { fetchUserAuditEvents } from "../services/audit/userAuditLog.js";
import { clampLimit } from "../utils/pagination.js";
import { requireUser } from "./helpers/routerHelpers.js";

export const userAuditRoutes = new Hono<AppEnv>();

userAuditRoutes.get("/me", async (c) => {
  const uid = requireUser(c);
  const limit = clampLimit(c.req.query("limit"), 100, 500);
  const events = await fetchUserAuditEvents(uid, limit);
  return c.json(success(events), 200);
});
