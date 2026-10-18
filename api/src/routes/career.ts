/**
 * /api/career — saved AI career-resilience reports (gap #103). Generating
 * one is the `career-resilience` AI tool (POST /api/ai/tools/career-resilience).
 *
 *   GET /resilience-reports           the caller's last 10 reports
 *   GET /resilience-report/:token     public share link (no user id)
 */
import { Hono } from "hono";
import type { AppEnv } from "../types/index.js";
import { success, error } from "../types/index.js";
import { findSharedResilienceReport, listResilienceReports } from "../services/career/resilienceReports.js";

export const careerRoutes = new Hono<AppEnv>();

careerRoutes.get("/resilience-reports", async (c) => c.json(success(await listResilienceReports(c.var.userId))));

careerRoutes.get("/resilience-report/:token", async (c) => {
  const report = await findSharedResilienceReport(c.req.param("token"));
  if (!report) return c.json(error("NOT_FOUND", "Report not found"), 404);
  return c.json(success(report));
});
