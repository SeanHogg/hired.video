/**
 * Studio collaboration WebSocket upgrade route (gap #2243 — real-time
 * collaborative editing).
 *
 *   GET /api/studio/:projectId/collab-socket?access_token=<jwt>  (Upgrade: websocket)
 *
 * Forwards the upgrade to the `StudioRoom` Durable Object keyed by
 * `projectId`, where presence + authoritative-doc relay + host election
 * live.
 *
 * AUTH — different from the Bearer-header `/api/*` path. A browser
 * `WebSocket` cannot set an `Authorization` header, so this route is in
 * the PUBLIC_PREFIXES carve-out (authMiddleware would 401 the headerless
 * upgrade) and verifies the JWT itself from the `?access_token=` query
 * param, then enforces `canActFor` against the project's REAL owner so
 * only the owner, company members, and invited `workspace_grants`
 * collaborators can join a private project's room. The verified userId +
 * display name are appended to the inner DO URL; the DO trusts them and
 * never re-authenticates.
 *
 * Mirrors [game-socket.ts](./game-socket.ts) / [chat-socket.ts](./chat-socket.ts)
 * — the project-wide DO-upgrade pattern (one DO instance per stable id
 * via `idFromName`).
 */

import { Hono } from "hono";
import { jwtVerify } from "jose";
import type { Variables } from "../types/index.js";
import { getJwtSecret } from "../utils/jwt.js";
import { resolveCollabRoomAccess } from "../services/studio/collab-access.js";

export const studioSocketRoutes = new Hono<{ Variables: Variables; Bindings: any }>();

studioSocketRoutes.get("/:projectId/collab-socket", async (c) => {
  const upgrade = c.req.header("upgrade");
  if (upgrade !== "websocket") {
    return c.text("Expected websocket upgrade", 426);
  }
  const projectId = c.req.param("projectId");
  if (!projectId) return c.text("Missing projectId", 400);

  // ── Verify the query-param JWT (browser WS can't send a Bearer header) ──
  const token = c.req.query("access_token");
  if (!token) return c.text("Unauthorized", 401);
  let userId: string;
  let displayName: string;
  try {
    const secretKey = new TextEncoder().encode(getJwtSecret());
    const { payload } = await jwtVerify(token, secretKey, { algorithms: ["HS256"] });
    if (!payload.sub) return c.text("Unauthorized", 401);
    userId = String(payload.sub);
    displayName =
      (payload as Record<string, unknown>).name as string ||
      (payload as Record<string, unknown>).email as string ||
      "Editor";
  } catch {
    return c.text("Unauthorized", 401);
  }

  // ── Authorize against the project's real owner (private-project gate) ──
  const access = await resolveCollabRoomAccess(userId, projectId);
  if (access === "not_found") return c.text("Project not found", 404);
  if (access === "forbidden") return c.text("Forbidden", 403);

  const env = (c.env as any) ?? {};
  const binding = env.STUDIO_ROOM as DurableObjectNamespace | undefined;
  if (!binding) {
    return c.text(
      "Studio realtime transport is not bound. Configure STUDIO_ROOM Durable Object in wrangler.toml.",
      503,
    );
  }

  // One DO per project — same instance is reused across all collaborators.
  const id = binding.idFromName(projectId);
  const stub = binding.get(id);

  const inner = new URL("https://studio-room.do/upgrade");
  inner.searchParams.set("userId", userId);
  inner.searchParams.set("projectId", projectId);
  inner.searchParams.set("name", displayName);
  const innerReq = new Request(inner.toString(), {
    method: "GET",
    headers: {
      Upgrade: "websocket",
      ...Object.fromEntries(c.req.raw.headers),
    },
  });
  return stub.fetch(innerReq);
});
