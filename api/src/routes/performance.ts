/**
 * /api/performance — user-facing performance cycles, goals/OKRs and reviews.
 * Goals and reviews persist in the canonical People Ops engine (people_goals /
 * people_performance_reviews, merged in 0634); PerformanceRepository maps them
 * back onto the original response shapes. Route → PerformanceService →
 * PerformanceRepository.
 */

import { Hono, type Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { z } from "zod";
import { UuidLikeSchema } from "../../../shared/validation.js";
import type { AppEnv } from "../types/index.js";
import { success, error } from "../types/index.js";
import { getDb } from "../db/index.js";
import { requirePro } from "../middleware/tierEnforcement.js";
import { isDomainError } from "../domains/errors.js";
import { PerformanceRepository } from "../repositories/performanceRepository.js";
import { PerformanceService, type LegacyKeyResult } from "../services/performance/performanceService.js";

export const performanceRoutes = new Hono<AppEnv>();

const CreateCycleSchema = z.object({
  name: z.string().min(1).max(255),
  type: z.enum(["quarterly", "annual", "mid-year", "probationary"]).default("quarterly"),
  startDate: z.string().datetime(),
  endDate: z.string().datetime(),
});

const CreateReviewSchema = z.object({
  cycleId: UuidLikeSchema,
  revieweeUserId: UuidLikeSchema,
  overallRating: z.number().min(1).max(5).optional(),
  strengths: z.string().optional(),
  areasForImprovement: z.string().optional(),
  goals: z.array(z.object({ goal: z.string(), status: z.string(), notes: z.string().optional() })).optional(),
  ratings: z.record(z.string(), z.number()).optional(),
  reviewerNotes: z.string().optional(),
});

const CreateGoalSchema = z.object({
  title: z.string().min(1).max(255),
  description: z.string().optional(),
  category: z.enum(["professional", "personal", "team"]).default("professional"),
  targetDate: z.string().datetime().optional(),
  cycleId: UuidLikeSchema.optional(),
});

const KeyResultSchema = z.object({
  title: z.string(),
  current: z.number(),
  target: z.number(),
  unit: z.string().optional(),
});

const gate = requirePro("Performance Management");
const service = () => new PerformanceService(new PerformanceRepository(getDb()));
const readBody = (c: Context<AppEnv>): Promise<unknown> => c.req.json().catch(() => null);
const asRecord = (v: unknown): Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : {};

/** Authenticated handler: resolves the caller and renders DomainErrors as the error envelope. */
function handle(run: (c: Context<AppEnv>, userId: string) => Promise<Response>) {
  return async (c: Context<AppEnv>): Promise<Response> => {
    const userId = c.var.user?.sub;
    if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
    try {
      return await run(c, userId);
    } catch (err) {
      if (isDomainError(err)) {
        return c.json(error(err.code, err.message, err.details), err.status as ContentfulStatusCode);
      }
      throw err;
    }
  };
}

// ── Cycles ───────────────────────────────────────────────────────────────────
performanceRoutes.get("/cycles", gate, handle(async (c, userId) =>
  c.json(success(await service().listCycles(userId)), 200)));

performanceRoutes.post("/cycles", gate, handle(async (c, userId) => {
  const parsed = CreateCycleSchema.safeParse(await readBody(c));
  if (!parsed.success) return c.json(error("VALIDATION_ERROR", "Invalid request", parsed.error.flatten()), 400);
  return c.json(success(await service().createCycle(userId, parsed.data)), 201);
}));

performanceRoutes.get("/cycles/:id", gate, handle(async (c, userId) =>
  c.json(success(await service().getCycle(userId, c.req.param("id"))), 200)));

performanceRoutes.patch("/cycles/:id/complete", gate, handle(async (c, userId) =>
  c.json(success(await service().completeCycle(userId, c.req.param("id"))), 200)));

// ── Reviews ──────────────────────────────────────────────────────────────────
performanceRoutes.post("/reviews", gate, handle(async (c, userId) => {
  const parsed = CreateReviewSchema.safeParse(await readBody(c));
  if (!parsed.success) return c.json(error("VALIDATION_ERROR", "Invalid request", parsed.error.flatten()), 400);
  return c.json(success(await service().createReview(userId, parsed.data)), 201);
}));

// Reviews I've written or received.
performanceRoutes.get("/reviews", gate, handle(async (c, userId) =>
  c.json(success(await service().listReviews(userId)), 200)));

performanceRoutes.patch("/reviews/:id/submit", gate, handle(async (c, userId) =>
  c.json(success(await service().submitReview(userId, c.req.param("id"))), 200)));

// Employee acknowledges a submitted review (#14).
performanceRoutes.patch("/reviews/:id/acknowledge", gate, handle(async (c, userId) => {
  const body = asRecord(await readBody(c));
  return c.json(success(await service().acknowledgeReview(userId, c.req.param("id"), body.response)), 200);
}));

// ── Goals / OKRs ─────────────────────────────────────────────────────────────
performanceRoutes.get("/goals", gate, handle(async (c, userId) =>
  c.json(success(await service().listGoals(userId)), 200)));

performanceRoutes.post("/goals", gate, handle(async (c, userId) => {
  const parsed = CreateGoalSchema.safeParse(await readBody(c));
  if (!parsed.success) return c.json(error("VALIDATION_ERROR", "Invalid request", parsed.error.flatten()), 400);
  return c.json(success(await service().createGoal(userId, parsed.data)), 201);
}));

performanceRoutes.patch("/goals/:id", gate, handle(async (c, userId) =>
  c.json(success(await service().updateGoal(userId, c.req.param("id"), asRecord(await readBody(c)))), 200)));

performanceRoutes.delete("/goals/:id", gate, handle(async (c, userId) => {
  await service().deleteGoal(userId, c.req.param("id"));
  return c.json(success({ deleted: true }), 200);
}));

// Dedicated OKR progress update (#14).
// Body: { progressPercentage?: number, keyResults?: Array<{title,current,target,unit}> }
// Key results persist on the goal's key_results; progress rolls up from them
// when no explicit percentage is given; 100% auto-completes the goal.
performanceRoutes.patch("/goals/:id/progress", gate, handle(async (c, userId) => {
  const body = asRecord(await readBody(c));
  const progress = typeof body.progressPercentage === "number" ? body.progressPercentage : undefined;
  const krs = z.array(KeyResultSchema).safeParse(body.keyResults);
  const keyResults: LegacyKeyResult[] | undefined = krs.success ? krs.data : undefined;
  return c.json(success(await service().updateGoalProgress(userId, c.req.param("id"), progress, keyResults)), 200);
}));

performanceRoutes.all("*", (c) =>
  c.json({ error: { code: "NOT_FOUND", message: "Performance route not found" } }, 404),
);
