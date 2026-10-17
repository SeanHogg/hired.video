/**
 * /api/advertising — job boosts (#106).
 * List goes through services/advertising/promotion.ts; pause / resume /
 * cancel are owner-scoped transitions. CREATING a job boost is paid-only:
 * POST /api/checkout {kind:"job_boost"} (services/billing/checkout/kinds/
 * jobBoost.ts) — the job is sponsored only once the payment is confirmed.
 * The unpaid company-boost endpoints (#107) were removed 2026-10-17 (no
 * callers); paid promotion of any subject is POST /api/checkout {kind:"boost"}.
 */

import { Hono } from "hono";
import { and, eq } from "drizzle-orm";
import type { AppEnv } from "../../types/index.js";
import { getDb, schema } from "../../db/index.js";
import { listJobBoosts } from "../../services/advertising/promotion.js";
import { AdPromotionRepository } from "../../repositories/adPromotionRepository.js";
import { ok, uid } from "./http.js";

export const advertisingBoostRoutes = new Hono<AppEnv>();

// ─── Job Boosts (gap #106) ────────────────────────────────────────────────────

// GET /api/advertising/boosts — list user's job boosts (title + resolved target)
advertisingBoostRoutes.get("/boosts", async (c) => {
  return c.json(ok(await listJobBoosts(uid(c))));
});

// PATCH /api/advertising/boosts/:id/pause — pause an ACTIVE boost
advertisingBoostRoutes.patch("/boosts/:id/pause", async (c) => {
  const boost = await new AdPromotionRepository(getDb()).transitionJobBoostStatus(c.req.param("id"), uid(c), "active", "paused");
  if (!boost) return c.json({ success: false, error: { code: "NOT_FOUND", message: "Boost not found" } }, 404);
  return c.json(ok(boost));
});

// PATCH /api/advertising/boosts/:id/resume — resume a PAUSED boost (never an
// unpaid pending_payment one)
advertisingBoostRoutes.patch("/boosts/:id/resume", async (c) => {
  const boost = await new AdPromotionRepository(getDb()).transitionJobBoostStatus(c.req.param("id"), uid(c), "paused", "active");
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
