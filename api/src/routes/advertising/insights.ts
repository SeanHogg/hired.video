/**
 * /api/advertising — KPI stats and the ROAS / funnel dashboard (#111).
 * Numbers come from services/advertising/insights.ts.
 */

import { Hono } from "hono";
import type { AppEnv } from "../../types/index.js";
import { getAdvertisingDashboard, getAdvertisingStats } from "../../services/advertising/insights.js";
import { success } from "../../types/index.js";

export const advertisingInsightRoutes = new Hono<AppEnv>();

// GET /api/advertising/stats — aggregate KPIs for the authenticated user
advertisingInsightRoutes.get("/stats", async (c) => {
  return c.json(success(await getAdvertisingStats(c.var.userId)));
});

// GET /api/advertising/analytics/dashboard?days= — unified ROAS + funnel
// across paid placements, joined to placements for hires + revenue.
advertisingInsightRoutes.get("/analytics/dashboard", async (c) => {
  const fromDays = Math.min(365, Math.max(1, parseInt(c.req.query("days") ?? "30", 10) || 30));
  return c.json(success(await getAdvertisingDashboard(c.var.userId, fromDays)));
});
