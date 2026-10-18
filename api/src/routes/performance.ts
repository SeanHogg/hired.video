/**
 * /api/performance — user-facing performance cycles, goals/OKRs and reviews.
 * Goals and reviews persist in the canonical People Ops engine (people_goals /
 * people_performance_reviews, merged in 0634); PerformanceRepository maps them
 * back onto the original response shapes. Route → PerformanceService →
 * PerformanceRepository.
 */

import { Hono, type Context } from "hono";
import { z } from "zod";
import { UuidLikeSchema } from "../../../shared/validation.js";
import type { AppEnv } from "../types/index.js";
import { success, error } from "../types/index.js";
import { requirePro } from "../middleware/tierEnforcement.js";
import { performanceService as service, type LegacyKeyResult } from "../services/performance/performanceService.js";
import { requireUser } from "./helpers/routerHelpers.js";
import { validateJson } from "./helpers/validate.js";

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
const readBody = (c: Context<AppEnv>): Promise<unknown> => c.req.json().catch(() => null);
const asRecord = (v: unknown): Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : {};

/** Body validator keeping the historical envelope; an unreadable body parses as null. */
const body = <T extends z.ZodTypeAny>(schema: T) =>
  validateJson(schema, (e) => error("VALIDATION_ERROR", "Invalid request", e.flatten()), { emptyBody: null });

// ── Cycles ───────────────────────────────────────────────────────────────────
performanceRoutes.get("/cycles", gate, async (c) =>
  c.json(success(await service().listCycles(requireUser(c))), 200));

performanceRoutes.post("/cycles", gate, body(CreateCycleSchema), async (c) =>
  c.json(success(await service().createCycle(requireUser(c), c.req.valid("json"))), 201));

performanceRoutes.get("/cycles/:id", gate, async (c) =>
  c.json(success(await service().getCycle(requireUser(c), c.req.param("id"))), 200));

performanceRoutes.patch("/cycles/:id/complete", gate, async (c) =>
  c.json(success(await service().completeCycle(requireUser(c), c.req.param("id"))), 200));

// ── Reviews ──────────────────────────────────────────────────────────────────
performanceRoutes.post("/reviews", gate, body(CreateReviewSchema), async (c) =>
  c.json(success(await service().createReview(requireUser(c), c.req.valid("json"))), 201));

// Reviews I've written or received.
performanceRoutes.get("/reviews", gate, async (c) =>
  c.json(success(await service().listReviews(requireUser(c))), 200));

performanceRoutes.patch("/reviews/:id/submit", gate, async (c) =>
  c.json(success(await service().submitReview(requireUser(c), c.req.param("id"))), 200));

// Employee acknowledges a submitted review (#14).
performanceRoutes.patch("/reviews/:id/acknowledge", gate, async (c) => {
  const userId = requireUser(c);
  const raw = asRecord(await readBody(c));
  return c.json(success(await service().acknowledgeReview(userId, c.req.param("id"), raw.response)), 200);
});

// ── Goals / OKRs ─────────────────────────────────────────────────────────────
performanceRoutes.get("/goals", gate, async (c) =>
  c.json(success(await service().listGoals(requireUser(c))), 200));

performanceRoutes.post("/goals", gate, body(CreateGoalSchema), async (c) =>
  c.json(success(await service().createGoal(requireUser(c), c.req.valid("json"))), 201));

performanceRoutes.patch("/goals/:id", gate, async (c) => {
  const userId = requireUser(c);
  return c.json(success(await service().updateGoal(userId, c.req.param("id"), asRecord(await readBody(c)))), 200);
});

performanceRoutes.delete("/goals/:id", gate, async (c) => {
  await service().deleteGoal(requireUser(c), c.req.param("id"));
  return c.json(success({ deleted: true }), 200);
});

// Dedicated OKR progress update (#14).
// Body: { progressPercentage?: number, keyResults?: Array<{title,current,target,unit}> }
// Key results persist on the goal's key_results; progress rolls up from them
// when no explicit percentage is given; 100% auto-completes the goal.
performanceRoutes.patch("/goals/:id/progress", gate, async (c) => {
  const userId = requireUser(c);
  const raw = asRecord(await readBody(c));
  const progress = typeof raw.progressPercentage === "number" ? raw.progressPercentage : undefined;
  const krs = z.array(KeyResultSchema).safeParse(raw.keyResults);
  const keyResults: LegacyKeyResult[] | undefined = krs.success ? krs.data : undefined;
  return c.json(success(await service().updateGoalProgress(userId, c.req.param("id"), progress, keyResults)), 200);
});
