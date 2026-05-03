/**
 * /api/inbox — single read-side endpoint for the Communication Hub.
 *
 * Replaces three separate fetches (`/api/communication/conversations`,
 * `/api/notifications`, `/api/users/me/connections/pending`) the
 * frontend used to fan out on every poll. One auth check, one
 * rate-limiter hit, one queryset.
 */

import { Hono } from "hono";
import type { Variables } from "../types/index.js";
import { success, error } from "../types/index.js";
import { getDb } from "../db/index.js";
import { buildRepos } from "../repositories/index.js";
import { getInboxFor } from "../services/messaging/inboxService.js";

export const inboxRoutes = new Hono<{ Variables: Variables }>();

inboxRoutes.get("/", async (c) => {
  const uid = c.var.user?.sub;
  if (!uid) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);

  const repos = buildRepos(getDb());
  const inbox = await getInboxFor({ repos }, uid);
  return c.json(success(inbox), 200);
});
