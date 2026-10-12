/**
 * /api/advertising — ad creatives (#110) with a content target (#176).
 */

import { Hono } from "hono";
import { and, eq } from "drizzle-orm";
import type { AppEnv } from "../../types/index.js";
import { getDb, schema } from "../../db/index.js";
import { createAd, listAds, updateAd } from "../../services/advertising/promotion.js";
import { CreateAdSchema, UpdateAdSchema, definedOnly } from "./schemas.js";
import { ok, uid } from "./http.js";

export const advertisingAdRoutes = new Hono<AppEnv>();

// ─── Ads / Creatives (gap #110) ───────────────────────────────────────────────

advertisingAdRoutes.get("/ad-sets/:id/ads", async (c) => {
  const result = await listAds(uid(c), c.req.param("id"));
  if ("code" in result) return c.json({ success: false, error: { code: result.code, message: result.message } }, 404);
  return c.json(ok(result.value));
});

advertisingAdRoutes.post("/ad-sets/:id/ads", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const parsed = CreateAdSchema.safeParse(body);
  if (!parsed.success) return c.json({ success: false, error: { code: "VALIDATION_ERROR", message: parsed.error.message } }, 400);
  const { target, ...fields } = parsed.data;
  const result = await createAd(uid(c), c.req.param("id"), { fields, target: target ?? undefined });
  if ("code" in result) return c.json({ success: false, error: { code: result.code, message: result.message } }, 404);
  return c.json(ok(result.value), 201);
});

advertisingAdRoutes.put("/ads/:id", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const parsed = UpdateAdSchema.safeParse(body);
  if (!parsed.success) return c.json({ success: false, error: { code: "VALIDATION_ERROR", message: parsed.error.message } }, 400);
  const { target, ...fields } = parsed.data;
  const result = await updateAd(uid(c), c.req.param("id"), { fields: definedOnly(fields), target });
  if ("code" in result) return c.json({ success: false, error: { code: result.code, message: result.message } }, 404);
  return c.json(ok(result.value));
});

advertisingAdRoutes.delete("/ads/:id", async (c) => {
  const db = getDb();
  const [deleted] = await db.delete(schema.ads)
    .where(and(eq(schema.ads.id, c.req.param("id")), eq(schema.ads.userId, uid(c))))
    .returning();
  if (!deleted) return c.json({ success: false, error: { code: "NOT_FOUND", message: "Ad not found" } }, 404);
  return c.json(ok({ deleted: true }));
});
