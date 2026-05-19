import { Hono } from "hono";
import { eq, and, desc } from "drizzle-orm";
import type { Variables } from "../types/index.js";
import { success, error } from "../types/index.js";
import { getDb, schema } from "../db/index.js";
import { requirePro } from "../middleware/tierEnforcement.js";
import { cacheMiddleware } from "../utils/cache-headers.js";

const { notifications } = schema;

export const notificationRoutes = new Hono<{ Variables: Variables }>();

// Inbox polls /api/inbox every 35s (SignalR is the primary push channel);
// the /api/notifications/* GETs share that cadence in places, so a 30s
// private cache lets repeat reads within a tick come straight from the
// browser. Mutations skip — the middleware only tags GET / 200.
notificationRoutes.use("/*", cacheMiddleware({ scope: "private", maxAge: 30 }));

function userId(c: any): string | null {
  return (c.var.user?.sub as string | undefined) ?? null;
}

notificationRoutes.get("/", async (c) => {
  const uid = userId(c);
  if (!uid) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  const db = getDb();
  const rows = await db
    .select()
    .from(notifications)
    .where(eq(notifications.userId, uid))
    .orderBy(desc(notifications.createdAt))
    .limit(50);
  return c.json(success(rows), 200);
});

notificationRoutes.get("/unread-count", async (c) => {
  const uid = userId(c);
  if (!uid) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  const db = getDb();
  const rows = await db
    .select({ id: notifications.id })
    .from(notifications)
    .where(and(eq(notifications.userId, uid), eq(notifications.isRead, false)));
  return c.json(success({ count: rows.length }), 200);
});

notificationRoutes.post("/mark-all-read", async (c) => {
  const uid = userId(c);
  if (!uid) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  const db = getDb();
  await db.update(notifications).set({ isRead: true } as any).where(eq(notifications.userId, uid));
  return c.json(success({ success: true }), 200);
});

notificationRoutes.post("/:id/mark-read", async (c) => {
  const uid = userId(c);
  if (!uid) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  const db = getDb();
  await db.update(notifications).set({ isRead: true } as any).where(and(eq(notifications.id, c.req.param("id")), eq(notifications.userId, uid)));
  return c.json(success({ success: true }), 200);
});

notificationRoutes.delete("/:id", async (c) => {
  const uid = userId(c);
  if (!uid) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  const db = getDb();
  await db.delete(notifications).where(and(eq(notifications.id, c.req.param("id")), eq(notifications.userId, uid)));
  return c.json(success({ success: true }), 200);
});

// ---------------------------------------------------------------------------
// GET /api/notifications/smart — AI-ranked notification feed (Pro)
//
// Assigns a priority score to each notification based on type and recency so
// that the most actionable items surface first, regardless of creation order.
// Priority weights (higher = more important):
//   match/interview/offer  → 10
//   message/application    → 7
//   review/feedback        → 5
//   system/general         → 2
// Recency bonus: +5 if < 1 hour old, +3 if < 24 hours, +1 if < 7 days.
// Unread bonus: +4 if unread.
// ---------------------------------------------------------------------------
const TYPE_WEIGHT: Record<string, number> = {
  match: 10,
  interview: 10,
  offer: 10,
  message: 7,
  application: 7,
  review: 5,
  feedback: 5,
  system: 2,
  general: 2,
};

function priorityScore(n: { type?: string | null; isRead?: boolean | null; createdAt?: Date | string | null }): number {
  const typeKey = (n.type ?? "general").toLowerCase();
  let score = TYPE_WEIGHT[typeKey] ?? 2;
  if (!n.isRead) score += 4;
  const ageMs = Date.now() - new Date(n.createdAt ?? 0).getTime();
  if (ageMs < 60 * 60 * 1000) score += 5;
  else if (ageMs < 24 * 60 * 60 * 1000) score += 3;
  else if (ageMs < 7 * 24 * 60 * 60 * 1000) score += 1;
  return score;
}

notificationRoutes.get("/smart", requirePro("Smart Notification Ranking"), async (c) => {
  const uid = userId(c);
  if (!uid) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  const db = getDb();

  const rows = await db
    .select()
    .from(notifications)
    .where(eq(notifications.userId, uid))
    .orderBy(desc(notifications.createdAt))
    .limit(100);

  const ranked = rows
    .map((n) => ({ ...n, priorityScore: priorityScore(n) }))
    .sort((a, b) => b.priorityScore - a.priorityScore)
    .slice(0, 50);

  return c.json(success(ranked), 200);
});

notificationRoutes.all("*", (c) =>
  c.json({ error: { code: "NOT_FOUND", message: "Notification route not found" } }, 404),
);