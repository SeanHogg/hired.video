/**
 * Professional graph routes — exposes the LinkedIn-Recruiter-style
 * mutual-connection / 2nd-degree-path / top-introducer queries on top
 * of the existing `user_connections` table.
 *
 *   GET  /api/graph/mutuals/:userId            — mutuals between me and userId
 *   GET  /api/graph/path/:userId               — shortest path me → userId (degree 1 / 2 / none)
 *   POST /api/graph/top-introducers            — body { candidateIds: string[] } → top of MY peers ranked by reach into the pool
 *
 * Auth required for all three; no admin gating because graph queries
 * are scoped to the caller's own connections.
 */

import { Hono } from "hono";
import { z } from "zod";
import type { Variables, AppEnv } from "../types/index.js";
import { error, success } from "../types/index.js";
import {
  findMutualConnections,
  findShortestPath,
  forwardWarmIntro,
  listWarmIntros,
  rankTopIntroducers,
  requestWarmIntro,
} from "../services/graph/professionalGraph.js";

export const graphRoutes = new Hono<AppEnv>();

function userId(c: any): string | null {
  return (c.var.user?.sub as string | undefined) ?? null;
}

graphRoutes.get("/mutuals/:userId", async (c) => {
  const me = userId(c);
  if (!me) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  const target = c.req.param("userId");
  if (!target) return c.json(error("VALIDATION_ERROR", "userId required"), 400);
  const result = await findMutualConnections(me, target);
  return c.json(success(result), 200);
});

graphRoutes.get("/path/:userId", async (c) => {
  const me = userId(c);
  if (!me) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  const target = c.req.param("userId");
  if (!target) return c.json(error("VALIDATION_ERROR", "userId required"), 400);
  const result = await findShortestPath(me, target);
  return c.json(success(result), 200);
});

const IntroducersSchema = z.object({
  candidateIds: z.array(z.string().uuid()).min(1).max(200),
  limit: z.number().int().min(1).max(50).optional(),
});

graphRoutes.post("/top-introducers", async (c) => {
  const me = userId(c);
  if (!me) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  const body = await c.req.json().catch(() => ({}));
  const parsed = IntroducersSchema.safeParse(body);
  if (!parsed.success) return c.json(error("VALIDATION_ERROR", parsed.error.message), 400);
  const result = await rankTopIntroducers(me, parsed.data.candidateIds, parsed.data.limit ?? 10);
  return c.json(success(result), 200);
});

// ─── POST /intro — request a warm intro through a mutual ────────────────
const WarmIntroSchema = z.object({
  viaUserId: z.string().uuid(),
  targetUserId: z.string().uuid(),
  message: z.string().min(1).max(2000),
});

graphRoutes.post("/intro", async (c) => {
  const me = userId(c);
  if (!me) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  const body = await c.req.json().catch(() => ({}));
  const parsed = WarmIntroSchema.safeParse(body);
  if (!parsed.success) return c.json(error("VALIDATION_ERROR", parsed.error.message), 400);
  const result = await requestWarmIntro(
    me,
    parsed.data.viaUserId,
    parsed.data.targetUserId,
    parsed.data.message,
  );
  if ("error" in result) {
    if (result.error === "self") return c.json(error("BAD_REQUEST", "Cannot request an intro with yourself"), 400);
    if (result.error === "via_not_mutual")
      return c.json(error("FORBIDDEN", "That person isn't a mutual connection between you two"), 403);
    return c.json(error("NOT_FOUND", "User not found"), 404);
  }
  return c.json(success(result), 201);
});

// ─── GET /intros/incoming|outgoing — warm-intro inbox ──────────────────
graphRoutes.get("/intros/incoming", async (c) => {
  const me = userId(c);
  if (!me) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  const result = await listWarmIntros(me, "incoming");
  return c.json(success(result), 200);
});

graphRoutes.get("/intros/outgoing", async (c) => {
  const me = userId(c);
  if (!me) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  const result = await listWarmIntros(me, "outgoing");
  return c.json(success(result), 200);
});

// ─── POST /intros/:conversationId/forward — mutual forwards the ask ───
graphRoutes.post("/intros/:conversationId/forward", async (c) => {
  const me = userId(c);
  if (!me) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  const conversationId = c.req.param("conversationId");
  if (!conversationId) return c.json(error("VALIDATION_ERROR", "conversationId required"), 400);
  const result = await forwardWarmIntro(me, conversationId);
  if ("error" in result) {
    if (result.error === "not_found") return c.json(error("NOT_FOUND", "Intro not found"), 404);
    if (result.error === "not_via")
      return c.json(error("FORBIDDEN", "Only the asked mutual can forward this intro"), 403);
    if (result.error === "not_warm_intro")
      return c.json(error("BAD_REQUEST", "Not a warm-intro conversation"), 400);
    return c.json(error("BAD_REQUEST", "Cannot forward this intro"), 400);
  }
  return c.json(success(result), result.created ? 201 : 200);
});
