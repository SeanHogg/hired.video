/**
 * GET /api/analytics/hiring?metric=time-to-hire|funnel|insights[&from=&to=]
 *
 * One hiring-analytics read. `time-to-hire` and `funnel` are Pro
 * (requirePro, same feature names as before); `insights` needs only a
 * signed-in user. Response shape per metric is unchanged from the retired
 * endpoints — see services/analytics/hiringAnalytics.ts.
 */
import { Hono } from "hono";
import type { AppEnv } from "../../types/index.js";
import { success, error } from "../../types/index.js";
import { requirePro } from "../../middleware/tierEnforcement.js";
import {
  HIRING_METRIC_PRO_FEATURE,
  HIRING_METRICS,
  computeHiringMetric,
  isHiringMetric,
} from "../../services/analytics/hiringAnalytics.js";

export const analyticsHiringRoutes = new Hono<AppEnv>();

analyticsHiringRoutes.get(
  "/hiring",
  async (c, next) => {
    const metric = c.req.query("metric");
    if (!isHiringMetric(metric)) {
      return c.json(error("VALIDATION_ERROR", `metric must be one of: ${HIRING_METRICS.join(", ")}`), 400);
    }
    if (!c.var.user?.sub) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
    const proFeature = HIRING_METRIC_PRO_FEATURE[metric];
    return proFeature ? requirePro(proFeature)(c, next) : next();
  },
  async (c) => {
    const metric = c.req.query("metric");
    if (!isHiringMetric(metric)) return c.json(error("VALIDATION_ERROR", "Invalid metric"), 400);
    const data = await computeHiringMetric(metric, c.var.user.sub, {
      from: c.req.query("from"),
      to: c.req.query("to"),
    });
    return c.json(success(data), 200);
  },
);
