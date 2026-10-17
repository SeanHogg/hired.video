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
import { getDb } from "../db/index.js";
import { CareerResilienceRepository } from "../repositories/careerResilienceRepository.js";

export const careerRoutes = new Hono<AppEnv>();

const repo = () => new CareerResilienceRepository(getDb());

careerRoutes.get("/resilience-reports", async (c) => c.json(success(await repo().listForUser(c.var.user.sub as string))));

careerRoutes.get("/resilience-report/:token", async (c) => {
  const report = await repo().findByShareToken(c.req.param("token"));
  if (!report) return c.json(error("NOT_FOUND", "Report not found"), 404);
  const { userId: _uid, ...publicReport } = report;
  return c.json(success(publicReport));
});
