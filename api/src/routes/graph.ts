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
  rankTopIntroducers,
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
