/**
 * /api/advertising — job boosts (#106) and company boosts (#107).
 * Create + list go through services/advertising/promotion.ts (#176 target,
 * #1764 pricing); pause / resume / cancel are simple owner-scoped updates.
 */

import { Hono } from "hono";
import { and, eq } from "drizzle-orm";
import type { AppEnv } from "../../types/index.js";
import { getDb, schema } from "../../db/index.js";
import {
  createCompanyBoost,
  createJobBoost,
  listCompanyBoosts,
  listJobBoosts,
} from "../../services/advertising/promotion.js";
import { CreateBoostSchema, CreateCompanyBoostSchema } from "./schemas.js";
import { ok, uid } from "./http.js";

export const advertisingBoostRoutes = new Hono<AppEnv>();

// ─── Job Boosts (gap #106) ────────────────────────────────────────────────────

// GET /api/advertising/boosts — list user's job boosts (title + resolved target)
advertisingBoostRoutes.get("/boosts", async (c) => {
  return c.json(ok(await listJobBoosts(uid(c))));
});

// POST /api/advertising/boosts — create a new job boost (#176: stamps the
// polymorphic target and still writes job_id; #1764: priced in one place).
advertisingBoostRoutes.post("/boosts", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const parsed = CreateBoostSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ success: false, error: { code: "VALIDATION_ERROR", message: parsed.error.message } }, 400);
  }
  const result = await createJobBoost(uid(c), parsed.data);
  if ("code" in result) return c.json({ success: false, error: { code: result.code, message: result.message } }, 404);
  return c.json(ok(result.value), 201);
});

// PATCH /api/advertising/boosts/:id/pause — pause a boost
advertisingBoostRoutes.patch("/boosts/:id/pause", async (c) => {
  const userId = uid(c);
  const db = getDb();
  const [boost] = await db.update(schema.jobBoosts)
    .set({ status: "paused", updatedAt: new Date() } as any)
    .where(and(eq(schema.jobBoosts.id, c.req.param("id")), eq(schema.jobBoosts.userId, userId)))
    .returning();
  if (!boost) return c.json({ success: false, error: { code: "NOT_FOUND", message: "Boost not found" } }, 404);
  return c.json(ok(boost));
});

// PATCH /api/advertising/boosts/:id/resume — resume a paused boost
advertisingBoostRoutes.patch("/boosts/:id/resume", async (c) => {
  const userId = uid(c);
  const db = getDb();
  const [boost] = await db.update(schema.jobBoosts)
    .set({ status: "active", updatedAt: new Date() } as any)
    .where(and(eq(schema.jobBoosts.id, c.req.param("id")), eq(schema.jobBoosts.userId, userId)))
    .returning();
  if (!boost) return c.json({ success: false, error: { code: "NOT_FOUND", message: "Boost not found" } }, 404);
  return c.json(ok(boost));
});

// DELETE /api/advertising/boosts/:id — cancel boost and unsponsor the job
advertisingBoostRoutes.delete("/boosts/:id", async (c) => {
  const userId = uid(c);
  const db = getDb();
  const [boost] = await db.select().from(schema.jobBoosts)
    .where(and(eq(schema.jobBoosts.id, c.req.param("id")), eq(schema.jobBoosts.userId, userId)))
    .limit(1);
  if (!boost) return c.json({ success: false, error: { code: "NOT_FOUND", message: "Boost not found" } }, 404);

  await db.update(schema.jobBoosts).set({ status: "cancelled", updatedAt: new Date() } as any).where(eq(schema.jobBoosts.id, boost.id));
  await db.update(schema.jobItems).set({ sponsored: false, sponsoredUntil: null, sponsoredRankBoost: 0 } as any).where(eq(schema.jobItems.id, boost.jobId));

  return c.json(ok({ cancelled: true }));
});

// ─── Company Boosts (gap #107) ────────────────────────────────────────────────

// GET /api/advertising/company-boosts — list current user's company boosts
advertisingBoostRoutes.get("/company-boosts", async (c) => {
  return c.json(ok(await listCompanyBoosts(uid(c))));
});

// POST /api/advertising/company-boosts — create a new company boost
advertisingBoostRoutes.post("/company-boosts", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const parsed = CreateCompanyBoostSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ success: false, error: { code: "VALIDATION_ERROR", message: parsed.error.message } }, 400);
  }
  const result = await createCompanyBoost(uid(c), parsed.data);
  if ("code" in result) return c.json({ success: false, error: { code: result.code, message: result.message } }, 404);
  return c.json(ok(result.value), 201);
});

// PATCH /api/advertising/company-boosts/:id/pause
advertisingBoostRoutes.patch("/company-boosts/:id/pause", async (c) => {
  const userId = uid(c);
  const db = getDb();
  const [boost] = await db.update(schema.companyBoosts)
    .set({ status: "paused", updatedAt: new Date() } as any)
    .where(and(eq(schema.companyBoosts.id, c.req.param("id")), eq(schema.companyBoosts.userId, userId)))
    .returning();
  if (!boost) return c.json({ success: false, error: { code: "NOT_FOUND", message: "Boost not found" } }, 404);
  return c.json(ok(boost));
});

// PATCH /api/advertising/company-boosts/:id/resume
advertisingBoostRoutes.patch("/company-boosts/:id/resume", async (c) => {
  const userId = uid(c);
  const db = getDb();
  const [boost] = await db.update(schema.companyBoosts)
    .set({ status: "active", updatedAt: new Date() } as any)
    .where(and(eq(schema.companyBoosts.id, c.req.param("id")), eq(schema.companyBoosts.userId, userId)))
    .returning();
  if (!boost) return c.json({ success: false, error: { code: "NOT_FOUND", message: "Boost not found" } }, 404);
  return c.json(ok(boost));
});

// DELETE /api/advertising/company-boosts/:id — cancel + unfeature the company
advertisingBoostRoutes.delete("/company-boosts/:id", async (c) => {
  const userId = uid(c);
  const db = getDb();
  const [boost] = await db.select().from(schema.companyBoosts)
    .where(and(eq(schema.companyBoosts.id, c.req.param("id")), eq(schema.companyBoosts.userId, userId)))
    .limit(1);
  if (!boost) return c.json({ success: false, error: { code: "NOT_FOUND", message: "Boost not found" } }, 404);

  await db.update(schema.companyBoosts).set({ status: "cancelled", updatedAt: new Date() } as any).where(eq(schema.companyBoosts.id, boost.id));
  await db.update(schema.companyProfiles).set({ featured: false, featuredUntil: null, featuredRankBoost: 0, updatedAt: new Date() } as any).where(eq(schema.companyProfiles.id, boost.companyId));

  return c.json(ok({ cancelled: true }));
});
