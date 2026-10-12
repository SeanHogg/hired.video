/**
 * Chat WebSocket upgrade route (gap #1230).
 *
 *   GET /api/chat/socket/:conversationId  (Upgrade: websocket)
 *
 * Forwards the upgrade request to a Cloudflare Durable Object instance
 * keyed by `conversationId`. The DO holds the open WebSocket pairs and
 * broadcasts message / typing / presence events to every connected
 * client in the room. See api/src/durable/ChatRoom.ts.
 *
 * Auth: behind the standard /api/* authMiddleware so the upgrade is
 * rejected for anonymous callers. The user identity is appended as
 * ?userId=&name= to the inner URL so the DO can attach it to the
 * accepted socket without re-authenticating.
 */

import { Hono } from "hono";
import type { Variables } from "../types/index.js";

export const chatSocketRoutes = new Hono<{ Variables: Variables; Bindings: any }>();

chatSocketRoutes.get("/:conversationId", async (c) => {
  const upgrade = c.req.header("upgrade");
  if (upgrade !== "websocket") {
    return c.text("Expected websocket upgrade", 426);
  }
  const conversationId = c.req.param("conversationId");
  if (!conversationId) return c.text("Missing conversationId", 400);

  const user = c.var.user;
  if (!user?.sub) return c.text("Unauthorized", 401);

  const env = (c.env as any) ?? {};
  const binding = env.CHAT_ROOM as DurableObjectNamespace | undefined;
  if (!binding) {
    // Local dev / non-wrangler runtime — surface a clear error.
    return c.text(
      "Chat realtime transport is not bound. Configure CHAT_ROOM Durable Object in wrangler.toml.",
      503,
    );
  }

  // Route every conversation to the same DO instance via idFromName.
  const id = binding.idFromName(conversationId);
  const stub = binding.get(id);

  // Build the inner upgrade request with the authenticated user identity
  // appended. The DO trusts these query params because the outer route
  // already passed authMiddleware.
  const inner = new URL("https://chat-room.do/upgrade");
  inner.searchParams.set("userId", user.sub);
  inner.searchParams.set("name", (user as any).name ?? (user as any).email ?? "User");
  const innerReq = new Request(inner.toString(), {
    method: "GET",
    headers: {
      Upgrade: "websocket",
      ...Object.fromEntries(c.req.raw.headers),
    },
  });
  return stub.fetch(innerReq);
});
