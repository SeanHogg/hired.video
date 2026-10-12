/**
 * /api/advertising — ad campaigns (#108), ad sets (#108/#109) and the
 * targeting reach estimate (#1769).
 */

import { Hono } from "hono";
import { and, desc, eq } from "drizzle-orm";
import type { AppEnv } from "../../types/index.js";
import { getDb, schema } from "../../db/index.js";
import { estimateActualReach } from "../../services/advertising/targeting-evaluator.js";
import { AdSetTargetingSchema, type AdSetTargeting } from "../../../../shared/ad-targeting.js";
import {
  CreateAdSetSchema,
  CreateCampaignSchema,
  UpdateAdSetSchema,
  UpdateCampaignSchema,
  definedOnly,
} from "./schemas.js";
import { ok, uid } from "./http.js";

export const advertisingCampaignRoutes = new Hono<AppEnv>();

// ─── Ad Campaigns (gap #108) ──────────────────────────────────────────────────

advertisingCampaignRoutes.get("/campaigns", async (c) => {
  const db = getDb();
  const campaigns = await db.select().from(schema.adCampaigns)
    .where(eq(schema.adCampaigns.userId, uid(c)))
    .orderBy(desc(schema.adCampaigns.createdAt));
  return c.json(ok(campaigns));
});

advertisingCampaignRoutes.post("/campaigns", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const parsed = CreateCampaignSchema.safeParse(body);
  if (!parsed.success) return c.json({ success: false, error: { code: "VALIDATION_ERROR", message: parsed.error.message } }, 400);

  const db = getDb();
  const [campaign] = await db.insert(schema.adCampaigns).values({
    userId: uid(c),
    ...parsed.data,
    startAt: parsed.data.startAt ? new Date(parsed.data.startAt) : undefined,
    endAt: parsed.data.endAt ? new Date(parsed.data.endAt) : undefined,
  } as any).returning();
  return c.json(ok(campaign), 201);
});

advertisingCampaignRoutes.put("/campaigns/:id", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const parsed = UpdateCampaignSchema.safeParse(body);
  if (!parsed.success) return c.json({ success: false, error: { code: "VALIDATION_ERROR", message: parsed.error.message } }, 400);

  const db = getDb();
  const [campaign] = await db.update(schema.adCampaigns)
    .set({ ...definedOnly(parsed.data), updatedAt: new Date() } as any)
    .where(and(eq(schema.adCampaigns.id, c.req.param("id")), eq(schema.adCampaigns.userId, uid(c))))
    .returning();
  if (!campaign) return c.json({ success: false, error: { code: "NOT_FOUND", message: "Campaign not found" } }, 404);
  return c.json(ok(campaign));
});

advertisingCampaignRoutes.delete("/campaigns/:id", async (c) => {
  const db = getDb();
  const [deleted] = await db.delete(schema.adCampaigns)
    .where(and(eq(schema.adCampaigns.id, c.req.param("id")), eq(schema.adCampaigns.userId, uid(c))))
    .returning();
  if (!deleted) return c.json({ success: false, error: { code: "NOT_FOUND", message: "Campaign not found" } }, 404);
  return c.json(ok({ deleted: true }));
});

// ─── Ad Sets (gap #108/#109) ──────────────────────────────────────────────────

// POST /api/advertising/targeting/estimate — live audience reach for an
// ad-set targeting spec (#1769). Same SQL predicate the ad renders with;
// cached per spec hash.
advertisingCampaignRoutes.post("/targeting/estimate", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const parsed = AdSetTargetingSchema.safeParse(body);
  if (!parsed.success) return c.json({ success: false, error: { code: "VALIDATION_ERROR", message: parsed.error.message } }, 400);
  return c.json(ok(await estimateActualReach(parsed.data as AdSetTargeting)));
});

advertisingCampaignRoutes.get("/campaigns/:id/ad-sets", async (c) => {
  const db = getDb();
  // Verify campaign ownership first
  const [campaign] = await db.select().from(schema.adCampaigns)
    .where(and(eq(schema.adCampaigns.id, c.req.param("id")), eq(schema.adCampaigns.userId, uid(c)))).limit(1);
  if (!campaign) return c.json({ success: false, error: { code: "NOT_FOUND", message: "Campaign not found" } }, 404);

  const adSets = await db.select().from(schema.adSets)
    .where(eq(schema.adSets.campaignId, c.req.param("id")))
    .orderBy(desc(schema.adSets.createdAt));
  return c.json(ok(adSets));
});

advertisingCampaignRoutes.post("/campaigns/:id/ad-sets", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const parsed = CreateAdSetSchema.safeParse(body);
  if (!parsed.success) return c.json({ success: false, error: { code: "VALIDATION_ERROR", message: parsed.error.message } }, 400);

  const db = getDb();
  const [campaign] = await db.select().from(schema.adCampaigns)
    .where(and(eq(schema.adCampaigns.id, c.req.param("id")), eq(schema.adCampaigns.userId, uid(c)))).limit(1);
  if (!campaign) return c.json({ success: false, error: { code: "NOT_FOUND", message: "Campaign not found" } }, 404);

  const [adSet] = await db.insert(schema.adSets).values({
    campaignId: c.req.param("id"),
    userId: uid(c),
    ...parsed.data,
    targetingJson: parsed.data.targetingJson ?? {},
    startAt: parsed.data.startAt ? new Date(parsed.data.startAt) : undefined,
    endAt: parsed.data.endAt ? new Date(parsed.data.endAt) : undefined,
  } as any).returning();
  return c.json(ok(adSet), 201);
});

advertisingCampaignRoutes.put("/ad-sets/:id", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const parsed = UpdateAdSetSchema.safeParse(body);
  if (!parsed.success) return c.json({ success: false, error: { code: "VALIDATION_ERROR", message: parsed.error.message } }, 400);

  const db = getDb();
  const [adSet] = await db.update(schema.adSets)
    .set({ ...definedOnly(parsed.data), updatedAt: new Date() } as any)
    .where(and(eq(schema.adSets.id, c.req.param("id")), eq(schema.adSets.userId, uid(c))))
    .returning();
  if (!adSet) return c.json({ success: false, error: { code: "NOT_FOUND", message: "Ad set not found" } }, 404);
  return c.json(ok(adSet));
});

advertisingCampaignRoutes.delete("/ad-sets/:id", async (c) => {
  const db = getDb();
  const [deleted] = await db.delete(schema.adSets)
    .where(and(eq(schema.adSets.id, c.req.param("id")), eq(schema.adSets.userId, uid(c))))
    .returning();
  if (!deleted) return c.json({ success: false, error: { code: "NOT_FOUND", message: "Ad set not found" } }, 404);
  return c.json(ok({ deleted: true }));
});
