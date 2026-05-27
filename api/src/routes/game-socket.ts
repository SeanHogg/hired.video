/**
 * Game WebSocket upgrade route (gap #1636 — 3D world multiplayer).
 *
 *   GET /api/games/:projectId/socket  (Upgrade: websocket)
 *
 * Forwards the WebSocket upgrade to the `GameSignalingRoom` Durable
 * Object keyed by `projectId`. The DO handles WebRTC signaling +
 * presence + authoritative challenge claims; per-frame gameplay
 * (positions, animations) flows peer-to-peer over WebRTC data
 * channels and never touches the DO.
 *
 * Auth: behind `/api/*` authMiddleware so the upgrade is rejected for
 * anonymous callers. The user identity is appended as
 * `?userId=&name=&projectId=` to the inner URL so the DO can attach
 * it to the accepted socket without re-authenticating.
 *
 * Mirrors [chat-socket.ts](./chat-socket.ts) — the project-wide DO-
 * upgrade pattern (one DO instance per stable id via `idFromName`).
 */

import { Hono } from "hono";
import type { Variables } from "../types/index.js";

export const gameSocketRoutes = new Hono<{ Variables: Variables; Bindings: any }>();

gameSocketRoutes.get("/:projectId/socket", async (c) => {
  const upgrade = c.req.header("upgrade");
  if (upgrade !== "websocket") {
    return c.text("Expected websocket upgrade", 426);
  }
  const projectId = c.req.param("projectId");
  if (!projectId) return c.text("Missing projectId", 400);

  const user = c.var.user;
  if (!user?.sub) return c.text("Unauthorized", 401);

  const env = (c.env as any) ?? {};
  const binding = env.GAME_ROOM as DurableObjectNamespace | undefined;
  if (!binding) {
    return c.text(
      "Game multiplayer transport is not bound. Configure GAME_ROOM Durable Object in wrangler.toml.",
      503,
    );
  }

  // One DO per project — same instance is reused across all peers in
  // the same world session.
  const id = binding.idFromName(projectId);
  const stub = binding.get(id);

  const inner = new URL("https://game-room.do/upgrade");
  inner.searchParams.set("userId", user.sub);
  inner.searchParams.set("projectId", projectId);
  inner.searchParams.set(
    "name",
    (user as any).name ?? (user as any).email ?? "Player",
  );
  const innerReq = new Request(inner.toString(), {
    method: "GET",
    headers: {
      Upgrade: "websocket",
      ...Object.fromEntries(c.req.raw.headers),
    },
  });
  return stub.fetch(innerReq);
});
