/**
 * /api/advertising — ad creatives (#110) with a content target (#176).
 */

import { Hono } from "hono";
import type { AppEnv } from "../../types/index.js";
import { createAd, deleteAd, listAds, updateAd } from "../../services/advertising/promotion.js";
import { CreateAdSchema, UpdateAdSchema, definedOnly } from "./schemas.js";
import { success, error } from "../../types/index.js";
import { validateJson } from "../helpers/validate.js";

export const advertisingAdRoutes = new Hono<AppEnv>();

// ─── Ads / Creatives (gap #110) ───────────────────────────────────────────────

advertisingAdRoutes.get("/ad-sets/:id/ads", async (c) => {
  const result = await listAds(c.var.userId, c.req.param("id"));
  if ("code" in result) return c.json(error(result.code, result.message), 404);
  return c.json(success(result.value));
});

advertisingAdRoutes.post("/ad-sets/:id/ads", validateJson(CreateAdSchema, (e) => error("VALIDATION_ERROR", e.message)), async (c) => {
  const body = c.req.valid("json");
  const { target, ...fields } = body;
  const result = await createAd(c.var.userId, c.req.param("id"), { fields, target: target ?? undefined });
  if ("code" in result) return c.json(error(result.code, result.message), 404);
  return c.json(success(result.value), 201);
});

advertisingAdRoutes.put("/ads/:id", validateJson(UpdateAdSchema, (e) => error("VALIDATION_ERROR", e.message)), async (c) => {
  const body = c.req.valid("json");
  const { target, ...fields } = body;
  const result = await updateAd(c.var.userId, c.req.param("id"), { fields: definedOnly(fields), target });
  if ("code" in result) return c.json(error(result.code, result.message), 404);
  return c.json(success(result.value));
});

advertisingAdRoutes.delete("/ads/:id", async (c) => {
  if (!(await deleteAd(c.var.userId, c.req.param("id")))) return c.json(error("NOT_FOUND", "Ad not found"), 404);
  return c.json(success({ deleted: true }));
});
