import { Hono } from "hono";
import type { AppEnv } from "../types/index.js";
import { success } from "../types/index.js";
import { requirePro } from "../middleware/tierEnforcement.js";
import { cacheMiddleware } from "../utils/cache-headers.js";
import { etagMiddleware } from "../utils/etag.js";
import { NOTIFICATION_LIST_FIELDS, parseFields } from "../../../shared/projection.js";
import {
  countUnreadNotifications,
  deleteNotification,
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  rankNotifications,
} from "../services/notifications/notificationFeed.js";
import { requireUser } from "./helpers/routerHelpers.js";

export const notificationRoutes = new Hono<AppEnv>();

// Inbox polls /api/inbox every 35s (SignalR is the primary push channel);
// the /api/notifications/* GETs share that cadence in places, so a 30s
// private cache lets repeat reads within a tick come straight from the
// browser. Mutations skip — the middleware only tags GET / 200. ETag
// 304s polled responses that have not changed across the window.
//
// No server-side KV cache: notifications are written from ~30 call sites
// across the API, so a cached unread count could not be invalidated
// reliably. The reads below are index-backed (user_id, is_read) instead.
notificationRoutes.use("/*", cacheMiddleware({ scope: "private", maxAge: 30 }));
notificationRoutes.use("/*", etagMiddleware());

notificationRoutes.get("/", async (c) => {
  const uid = requireUser(c);
  // Drizzle-side projection (gap #1445) — `?fields=` narrows the SELECT
  // so Neon only reads + ships the columns the caller asked for.
  const fields = parseFields(c.req.query("fields"), NOTIFICATION_LIST_FIELDS);
  const rows = await listNotifications(uid, fields, 50);
  return c.json(success(rows), 200);
});

notificationRoutes.get("/unread-count", async (c) => {
  const uid = requireUser(c);
  const count = await countUnreadNotifications(uid);
  return c.json(success({ count }), 200);
});

notificationRoutes.post("/mark-all-read", async (c) => {
  const uid = requireUser(c);
  await markAllNotificationsRead(uid);
  return c.json(success({ success: true }), 200);
});

notificationRoutes.post("/:id/mark-read", async (c) => {
  const uid = requireUser(c);
  await markNotificationRead(uid, c.req.param("id"));
  return c.json(success({ success: true }), 200);
});

notificationRoutes.delete("/:id", async (c) => {
  const uid = requireUser(c);
  await deleteNotification(uid, c.req.param("id"));
  return c.json(success({ success: true }), 200);
});

// GET /api/notifications/smart — AI-ranked notification feed (Pro): the most
// actionable items first (type weight + recency + unread), see
// services/notifications/notificationFeed.ts.
notificationRoutes.get("/smart", requirePro("Smart Notification Ranking"), async (c) => {
  const uid = requireUser(c);
  return c.json(success(await rankNotifications(uid)), 200);
});
