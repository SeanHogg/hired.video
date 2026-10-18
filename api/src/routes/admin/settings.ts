/**
 * SuperAdmin platform configuration — mounted by the admin composite
 * (routes/admin/index.ts), which applies the SA guard.
 *
 *   /api/admin/settings  GET | PUT   — system key-value settings
 *   /api/admin/pricing   GET | PATCH — runtime-editable subscription prices
 *                                      (public read mirror: GET /api/billing/pricing-config)
 */
import { Hono } from "hono";
import { z } from "zod";
import type { AppEnv } from "../../types/index.js";
import { SystemSettingsService } from "../../services/admin/SystemSettingsService.js";
import { getPricingConfig, updatePricingConfig } from "../../services/platform/PricingConfigService.js";
import { success, error } from "../../types/index.js";
import { validateJson } from "../helpers/validate.js";

const SettingsUpdateSchema = z.record(z.string(), z.string().nullable());

const PricingConfigSchema = z.object({
  proMonthlyCents: z.number().int().min(0).max(100_000_00),
  proYearlyCents: z.number().int().min(0).max(100_000_00),
  seatPriceCents: z.number().int().min(0).max(100_000_00),
});

export const adminSettingsRoutes = new Hono<AppEnv>();

adminSettingsRoutes.get("/", async (c) => c.json(success(await SystemSettingsService.list()), 200));

adminSettingsRoutes.put("/", validateJson(SettingsUpdateSchema, (e) => error("BAD_REQUEST", e.issues[0].message)), async (c) => {
  const body = c.req.valid("json");
  const updated = await SystemSettingsService.upsert(Object.entries(body));
  return c.json(success({ updated }), 200);
});

export const adminPricingRoutes = new Hono<AppEnv>();

adminPricingRoutes.get("/", async (c) => c.json(success(await getPricingConfig()), 200));

adminPricingRoutes.patch("/", validateJson(PricingConfigSchema, (e) => error("VALIDATION_ERROR", "Invalid pricing config", e.flatten()), { emptyBody: null }), async (c) => {
  const body = c.req.valid("json");
  const updated = await updatePricingConfig({ ...body, updatedByUserId: c.var.userId ?? null });
  return c.json(success(updated), 200);
});
