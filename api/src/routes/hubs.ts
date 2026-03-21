import { Hono } from "hono";
import { eq, and, desc } from "drizzle-orm";
import type { Variables } from "../types/index.js";
import { error } from "../types/index.js";
import { getDb, schema } from "../db/index.js";

export const hubsRoutes = new Hono<{ Variables: Variables }>();

// ---------------------------------------------------------------------------
// SSE notification stream
//
// Replaces the legacy SignalR /negotiate + WebSocket pattern.
// Cloudflare Workers support streaming responses natively. This endpoint:
//   1. Immediately sends all unread notifications as SSE events.
//   2. Sends a "connected" ping so clients know the stream is live.
//   3. Closes — clients should reconnect on a short interval or use polling
//      via GET /api/notifications for a simpler approach.
//
// SignalR clients (legacy) called POST /negotiate first; we return a
// compatible-enough JSON fragment so they don't error hard.
// ---------------------------------------------------------------------------

hubsRoutes.post("/notifications/negotiate", (c) => {
  // Return a minimal SignalR negotiate response that redirects clients to use
  // the SSE endpoint instead of a true WebSocket transport.
  return c.json(
    {
      negotiateVersion: 1,
      connectionId: crypto.randomUUID(),
      connectionToken: crypto.randomUUID(),
      availableTransports: [{ transport: "ServerSentEvents", transferFormats: ["Text"] }],
      url: "/api/hubs/notifications",
    },
    200,
  );
});

hubsRoutes.get("/notifications", async (c) => {
  const userId = c.var.user?.sub;
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);

  const db = getDb();
  const unread = await db
    .select()
    .from(schema.notifications)
    .where(and(eq(schema.notifications.userId, userId), eq(schema.notifications.isRead, false)))
    .orderBy(desc(schema.notifications.createdAt))
    .limit(50);

  // Build an SSE stream
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      const send = (event: string, data: unknown) => {
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      };

      // Send a "connected" lifecycle event
      send("connected", { timestamp: new Date().toISOString() });

      // Emit each unread notification as an individual event
      for (const n of unread) {
        send("notification", {
          id: n.id,
          type: (n as any).type ?? "info",
          title: (n as any).title ?? "",
          message: (n as any).message ?? "",
          isRead: n.isRead,
          createdAt: n.createdAt,
        });
      }

      // Emit a summary count event then close
      send("summary", { unreadCount: unread.length });
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "X-Accel-Buffering": "no",
    },
  });
});

// POST variant kept for legacy SignalR client compatibility — redirects to GET behaviour
hubsRoutes.post("/notifications", async (c) => {
  return c.redirect("/api/hubs/notifications", 307);
});

hubsRoutes.all("*", (c) =>
  c.json({ error: { code: "NOT_FOUND", message: "Hub route not found" } }, 404),
);
