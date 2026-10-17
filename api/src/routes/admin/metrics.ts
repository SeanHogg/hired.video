/**
 * SuperAdmin product-dashboard metrics — mounted at /api/admin/metrics by the
 * admin composite (routes/admin/index.ts), which applies the SA guard.
 *
 *   GET /                      — full product dashboard
 *   GET /saas                  — standalone SaaS metrics + 6-month series
 *   GET /time-series/:metric   — 30 daily points for users|jobs|resumes|subscriptions
 *   GET /affiliate-stats       — affiliate program rollup
 *   GET /export/:format        — headline metrics as a CSV download
 */
import { Hono } from "hono";
import type { AppEnv } from "../../types/index.js";
import { ok } from "../../utils/response.js";
import { AdminMetricsService } from "../../services/admin/AdminMetricsService.js";

export const adminMetricsRoutes = new Hono<AppEnv>();

adminMetricsRoutes.get("/", async (c) => c.json(ok(await AdminMetricsService.create().dashboard()), 200));

adminMetricsRoutes.get("/saas", async (c) => c.json(ok(await AdminMetricsService.create().saas()), 200));

adminMetricsRoutes.get("/time-series/:metric", async (c) =>
  c.json(ok(await AdminMetricsService.create().timeSeries(c.req.param("metric"))), 200),
);

adminMetricsRoutes.get("/affiliate-stats", (c) => c.json(ok(AdminMetricsService.affiliateStats()), 200));

adminMetricsRoutes.get("/export/:format", async (c) => {
  const format = c.req.param("format");
  const csv = await AdminMetricsService.create().exportCsv();
  const filename = `product-dashboard-${new Date().toISOString().slice(0, 10)}.${format === "csv" ? "csv" : "txt"}`;
  return new Response(csv, {
    status: 200,
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${filename}"` },
  });
});
