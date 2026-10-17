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
import { ok } from "../../utils/response.js";
import { SystemSettingsService } from "../../services/admin/SystemSettingsService.js";
import { getPricingConfig, updatePricingConfig } from "../../services/platform/PricingConfigService.js";

const SettingsUpdateSchema = z.record(z.string(), z.string().nullable());

const PricingConfigSchema = z.object({
  proMonthlyCents: z.number().int().min(0).max(100_000_00),
  proYearlyCents: z.number().int().min(0).max(100_000_00),
  seatPriceCents: z.number().int().min(0).max(100_000_00),
});

export const adminSettingsRoutes = new Hono<AppEnv>();

adminSettingsRoutes.get("/", async (c) => c.json(ok(await SystemSettingsService.list()), 200));

adminSettingsRoutes.put("/", async (c) => {
  const body = SettingsUpdateSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!body.success) return c.json({ error: { code: "BAD_REQUEST", message: body.error.issues[0].message } }, 400);
  const updated = await SystemSettingsService.upsert(Object.entries(body.data));
  return c.json(ok({ updated }), 200);
});

export const adminPricingRoutes = new Hono<AppEnv>();

adminPricingRoutes.get("/", async (c) => c.json(ok(await getPricingConfig()), 200));

adminPricingRoutes.patch("/", async (c) => {
  const parsed = PricingConfigSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    return c.json(
      { error: { code: "VALIDATION_ERROR", message: "Invalid pricing config", details: parsed.error.flatten() } },
      400,
    );
  }
  const updated = await updatePricingConfig({ ...parsed.data, updatedByUserId: c.var.user?.sub ?? null });
  return c.json(ok(updated), 200);
});
