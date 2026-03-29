/**
 * PWA Web Push subscription management
 *
 * POST /api/push/subscribe    — save a Web Push subscription for the current user
 * DELETE /api/push/unsubscribe — remove subscription by endpoint
 */

import { Hono } from "hono";
import { eq, and } from "drizzle-orm";
import type { Variables } from "../types/index.js";
import { success, error } from "../types/index.js";
import { getDb, schema } from "../db/index.js";

const { pushSubscriptions } = schema;

export const pushRoutes = new Hono<{ Variables: Variables }>();

function uid(c: any): string | null {
  return (c.var.user?.sub as string | undefined) ?? null;
}

// ---------------------------------------------------------------------------
// POST /api/push/subscribe
// Body: { endpoint, keys: { p256dh, auth } }
// ---------------------------------------------------------------------------
pushRoutes.post("/subscribe", async (c) => {
  const userId = uid(c);
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);

  const body = await c.req.json().catch(() => ({})) as {
    endpoint?: string;
    keys?: { p256dh?: string; auth?: string };
  };

  if (!body.endpoint || !body.keys?.p256dh || !body.keys?.auth) {
    return c.json(
      error("VALIDATION_ERROR", "endpoint, keys.p256dh, and keys.auth are required"),
      400,
    );
  }

  const db = getDb();
  await db
    .insert(pushSubscriptions)
    .values({
      userId,
      endpoint: body.endpoint,
      p256dh: body.keys.p256dh,
      auth: body.keys.auth,
    } as any)
    .onConflictDoUpdate({
      target: pushSubscriptions.endpoint,
      set: { userId, p256dh: body.keys.p256dh, auth: body.keys.auth } as any,
    });

  return c.json(success({ subscribed: true }), 200);
});

// ---------------------------------------------------------------------------
// POST /api/push/unsubscribe
// Body: { endpoint }
// ---------------------------------------------------------------------------
pushRoutes.post("/unsubscribe", async (c) => {
  const userId = uid(c);
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);

  const body = await c.req.json().catch(() => ({})) as { endpoint?: string };
  if (!body.endpoint) {
    return c.json(error("VALIDATION_ERROR", "endpoint is required"), 400);
  }

  const db = getDb();
  await db
    .delete(pushSubscriptions)
    .where(
      and(
        eq(pushSubscriptions.endpoint, body.endpoint),
        eq(pushSubscriptions.userId, userId),
      ),
    );

  return c.json(success({ unsubscribed: true }), 200);
});

pushRoutes.all("*", (c) =>
  c.json({ error: { code: "NOT_FOUND", message: "Push route not found" } }, 404),
);
