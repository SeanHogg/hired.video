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
import type { AppEnv } from "../../types/index.js";
import { cancelJobBoost, listJobBoosts, transitionJobBoost } from "../../services/advertising/promotion.js";
import { success, error } from "../../types/index.js";

export const advertisingBoostRoutes = new Hono<AppEnv>();

// ─── Job Boosts (gap #106) ────────────────────────────────────────────────────

// GET /api/advertising/boosts — list user's job boosts (title + resolved target)
advertisingBoostRoutes.get("/boosts", async (c) => {
  return c.json(success(await listJobBoosts(c.var.userId)));
});

// PATCH /api/advertising/boosts/:id/pause — pause an ACTIVE boost
advertisingBoostRoutes.patch("/boosts/:id/pause", async (c) => {
  const boost = await transitionJobBoost(c.var.userId, c.req.param("id"), "active", "paused");
  if (!boost) return c.json(error("NOT_FOUND", "Boost not found"), 404);
  return c.json(success(boost));
});

// PATCH /api/advertising/boosts/:id/resume — resume a PAUSED boost (never an
// unpaid pending_payment one)
advertisingBoostRoutes.patch("/boosts/:id/resume", async (c) => {
  const boost = await transitionJobBoost(c.var.userId, c.req.param("id"), "paused", "active");
  if (!boost) return c.json(error("NOT_FOUND", "Boost not found"), 404);
  return c.json(success(boost));
});

// DELETE /api/advertising/boosts/:id — cancel boost and unsponsor the job
advertisingBoostRoutes.delete("/boosts/:id", async (c) => {
  if (!(await cancelJobBoost(c.var.userId, c.req.param("id")))) {
    return c.json(error("NOT_FOUND", "Boost not found"), 404);
  }
  return c.json(success({ cancelled: true }));
});
