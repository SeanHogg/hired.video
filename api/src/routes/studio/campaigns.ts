/**
 * Campaign management.
 *   GET    /api/studio/campaigns           — list my campaigns (?workspace=)
 *   POST   /api/studio/campaigns           — create campaign
 *   PATCH  /api/studio/campaigns/:id       — update campaign
 *   DELETE /api/studio/campaigns/:id       — archive campaign
 *   GET    /api/studio/campaigns/:id/stats — rollup analytics for campaign
 */
import { Hono } from "hono";
import type { AppEnv } from "../../types/index.js";
import {
  archiveCampaign,
  CampaignSchema,
  campaignStats,
  createCampaign,
  listCampaigns,
  patchCampaign,
} from "../../services/studio/campaigns.js";
import { parseWorkspaceQueryParam } from "../../services/studio/workspace-request.js";
import { actorId, fail, ok, studioErrorResponse } from "./http.js";

export const studioCampaignRoutes = new Hono<AppEnv>();

studioCampaignRoutes.get("/campaigns", async (c) => {
  const userId = actorId(c);
  if (!userId) return c.json(fail("UNAUTHORIZED", "Authentication required"), 401);
  return c.json(ok(await listCampaigns(userId, parseWorkspaceQueryParam(c.req.query("workspace")))));
});

studioCampaignRoutes.post("/campaigns", async (c) => {
  const userId = actorId(c);
  if (!userId) return c.json(fail("UNAUTHORIZED", "Authentication required"), 401);
  const body = await c.req.json().catch(() => null);
  const parsed = CampaignSchema.safeParse(body);
  if (!parsed.success) return c.json(fail("VALIDATION_ERROR", "Invalid request", parsed.error.flatten()), 400);
  try {
    return c.json(ok(await createCampaign(userId, parsed.data, body)), 201);
  } catch (e) {
    return studioErrorResponse(c, e);
  }
});

studioCampaignRoutes.patch("/campaigns/:id", async (c) => {
  const userId = actorId(c);
  if (!userId) return c.json(fail("UNAUTHORIZED", "Authentication required"), 401);
  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown> | null;
  try {
    return c.json(ok(await patchCampaign(userId, c.req.param("id"), body ?? {})));
  } catch (e) {
    return studioErrorResponse(c, e);
  }
});

studioCampaignRoutes.delete("/campaigns/:id", async (c) => {
  const userId = actorId(c);
  if (!userId) return c.json(fail("UNAUTHORIZED", "Authentication required"), 401);
  try {
    return c.json(ok(await archiveCampaign(userId, c.req.param("id"))));
  } catch (e) {
    return studioErrorResponse(c, e);
  }
});

studioCampaignRoutes.get("/campaigns/:id/stats", async (c) => {
  const userId = actorId(c);
  if (!userId) return c.json(fail("UNAUTHORIZED", "Authentication required"), 401);
  try {
    return c.json(ok(await campaignStats(userId, c.req.param("id"))));
  } catch (e) {
    return studioErrorResponse(c, e);
  }
});
