import { Hono } from "hono";
import type { AppEnv } from "../types/index.js";
import {
  countUnreadNotifications,
  listUnreadNotifications,
  notificationCursorFrom,
  parseNotificationCursor,
} from "../services/notifications/notificationFeed.js";
import { requireUser } from "./helpers/routerHelpers.js";

export const hubsRoutes = new Hono<AppEnv>();

// ---------------------------------------------------------------------------
// SSE notification stream
//
// Replaces the legacy SignalR /negotiate + WebSocket pattern.
// Cloudflare Workers support streaming responses natively. This endpoint:
//   1. Immediately sends unread notifications as SSE events — all of them
//      (newest 50) on a first poll, or only those created since the client's
//      `?since=<ISO>` cursor on a re-poll (an indexed range scan instead of
//      re-sending every unread row each minute).
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
  const userId = requireUser(c);

  const since = parseNotificationCursor(c.req.query("since"));
  const unread = await listUnreadNotifications(userId, 50, since);
  // A cursored poll only carries the NEW rows, so the badge count comes from
  // the (isolate-cached) unread count; a full burst keeps its legacy count.
  const unreadCount = since ? await countUnreadNotifications(userId) : unread.length;
  const cursor = notificationCursorFrom(unread, since);

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
          type: n.type ?? "info",
          title: n.title ?? "",
          message: n.message ?? "",
          isRead: n.isRead,
          createdAt: n.createdAt,
        });
      }

      // Emit a summary count event then close
      send("summary", { unreadCount, cursor });
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
