/**
 * /api/advertising — ad campaigns (#108), ad sets (#108/#109) and the
 * targeting reach estimate (#1769).
 */

import { Hono } from "hono";
import type { AppEnv } from "../../types/index.js";
import { estimateActualReach } from "../../services/advertising/targeting-evaluator.js";
import {
  createAdCampaign,
  createAdSet,
  deleteAdCampaign,
  deleteAdSet,
  listAdCampaigns,
  listAdSets,
  updateAdCampaign,
  updateAdSet,
} from "../../services/advertising/ad-campaigns.js";
import { AdSetTargetingSchema, type AdSetTargeting } from "../../../../shared/ad-targeting.js";
import {
  CreateAdSetSchema,
  CreateCampaignSchema,
  UpdateAdSetSchema,
  UpdateCampaignSchema,
  definedOnly,
} from "./schemas.js";
import { success, error } from "../../types/index.js";
import { validateJson } from "../helpers/validate.js";

export const advertisingCampaignRoutes = new Hono<AppEnv>();

// ─── Ad Campaigns (gap #108) ──────────────────────────────────────────────────

advertisingCampaignRoutes.get("/campaigns", async (c) => {
  return c.json(success(await listAdCampaigns(c.var.userId)));
});

advertisingCampaignRoutes.post("/campaigns", validateJson(CreateCampaignSchema, (e) => error("VALIDATION_ERROR", e.message)), async (c) => {
  const campaign = await createAdCampaign(c.var.userId, c.req.valid("json"));
  return c.json(success(campaign), 201);
});

advertisingCampaignRoutes.put("/campaigns/:id", validateJson(UpdateCampaignSchema, (e) => error("VALIDATION_ERROR", e.message)), async (c) => {
  const campaign = await updateAdCampaign(c.var.userId, c.req.param("id"), definedOnly(c.req.valid("json")));
  return c.json(success(campaign));
});

advertisingCampaignRoutes.delete("/campaigns/:id", async (c) => {
  await deleteAdCampaign(c.var.userId, c.req.param("id"));
  return c.json(success({ deleted: true }));
});

// ─── Ad Sets (gap #108/#109) ──────────────────────────────────────────────────

// POST /api/advertising/targeting/estimate — live audience reach for an
// ad-set targeting spec (#1769). Same SQL predicate the ad renders with;
// cached per spec hash.
advertisingCampaignRoutes.post("/targeting/estimate", validateJson(AdSetTargetingSchema, (e) => error("VALIDATION_ERROR", e.message)), async (c) => {
  const body = c.req.valid("json");
  return c.json(success(await estimateActualReach(body as AdSetTargeting)));
});

advertisingCampaignRoutes.get("/campaigns/:id/ad-sets", async (c) => {
  return c.json(success(await listAdSets(c.var.userId, c.req.param("id"))));
});

advertisingCampaignRoutes.post("/campaigns/:id/ad-sets", validateJson(CreateAdSetSchema, (e) => error("VALIDATION_ERROR", e.message)), async (c) => {
  const adSet = await createAdSet(c.var.userId, c.req.param("id"), c.req.valid("json"));
  return c.json(success(adSet), 201);
});

advertisingCampaignRoutes.put("/ad-sets/:id", validateJson(UpdateAdSetSchema, (e) => error("VALIDATION_ERROR", e.message)), async (c) => {
  const adSet = await updateAdSet(c.var.userId, c.req.param("id"), definedOnly(c.req.valid("json")));
  return c.json(success(adSet));
});

advertisingCampaignRoutes.delete("/ad-sets/:id", async (c) => {
  await deleteAdSet(c.var.userId, c.req.param("id"));
  return c.json(success({ deleted: true }));
});
