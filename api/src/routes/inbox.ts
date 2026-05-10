/**
 * /api/inbox — single read-side endpoint for the Communication Hub.
 *
 * Replaces multiple fetches (`/api/communication/conversations`,
 * `/api/notifications`, `/api/users/me/connections/pending`, …) the
 * frontend used to fan out on every poll. One auth check, one
 * rate-limiter hit, one queryset.
 *
 * Per-row mutations live on this router too so the hub keeps a single
 * surface for read + write of inbox state, even when a row's underlying
 * data lives in a non-conversation aggregate (e.g. external email).
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

inboxRoutes.post("/external-emails/:id/mark-read", async (c) => {
  const uid = c.var.user?.sub;
  if (!uid) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  const repos = buildRepos(getDb());
  await repos.externalEmailMessages.markRead(c.req.param("id"), uid);
  return c.json(success({ success: true }), 200);
});

inboxRoutes.post("/external-emails/mark-all-read", async (c) => {
  const uid = c.var.user?.sub;
  if (!uid) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  const repos = buildRepos(getDb());
  await repos.externalEmailMessages.markAllReadForUser(uid);
  return c.json(success({ success: true }), 200);
});

inboxRoutes.post("/external-emails/:id/archive", async (c) => {
  const uid = c.var.user?.sub;
  if (!uid) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  const body = await c.req.json().catch(() => ({}));
  const archived = body?.archived !== false; // default true
  const repos = buildRepos(getDb());
  await repos.externalEmailMessages.setArchived(c.req.param("id"), uid, archived);
  return c.json(success({ success: true }), 200);
});
