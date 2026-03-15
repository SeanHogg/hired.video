import { Hono } from "hono";
import { eq, and, desc } from "drizzle-orm";
import type { Variables } from "../types/index.js";
import { success, error } from "../types/index.js";
import { getDb, schema } from "../db/index.js";

const { notifications } = schema;

export const notificationRoutes = new Hono<{ Variables: Variables }>();

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

notificationRoutes.all("*", (c) =>
  c.json({ error: { code: "NOT_FOUND", message: "Notification route not found" } }, 404),
);