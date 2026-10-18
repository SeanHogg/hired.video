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
import { success, error } from "../../types/index.js";
import { requireUser } from "../helpers/routerHelpers.js";
import { validateJson } from "../helpers/validate.js";

export const studioCampaignRoutes = new Hono<AppEnv>();

studioCampaignRoutes.get("/campaigns", async (c) => {
  const userId = requireUser(c);
  return c.json(success(await listCampaigns(userId, parseWorkspaceQueryParam(c.req.query("workspace")))));
});

studioCampaignRoutes.post("/campaigns", validateJson(CampaignSchema, undefined, { emptyBody: null }), async (c) => {
  const userId = requireUser(c);
  // The raw body too (Hono caches the parsed JSON) — the service reads extra fields off it.
  return c.json(success(await createCampaign(userId, c.req.valid("json"), await c.req.json())), 201);
});

studioCampaignRoutes.patch("/campaigns/:id", async (c) => {
  const userId = requireUser(c);
  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown> | null;
  return c.json(success(await patchCampaign(userId, c.req.param("id"), body ?? {})));
});

studioCampaignRoutes.delete("/campaigns/:id", async (c) => {
  const userId = requireUser(c);
  return c.json(success(await archiveCampaign(userId, c.req.param("id"))));
});

studioCampaignRoutes.get("/campaigns/:id/stats", async (c) => {
  const userId = requireUser(c);
  return c.json(success(await campaignStats(userId, c.req.param("id"))));
});
