/**
 * /api/learning/goals — a learner's own stated objectives. Captured in the
 * onboarding funnel and on the learner home; drives course recommendations
 * and gives the AI brain a durable signal of intent.
 *
 *   GET    /goals/me                      — my goals, newest first
 *   POST   /goals                         — capture a goal
 *   PATCH  /goals/:id                     — edit text / change status
 *   DELETE /goals/:id
 *   GET    /goals/:id/recommendations     — keyword recall + LLM re-rank (cached)
 *   POST   /goals/:id/generate-path       — draft learning path from the goal
 *
 * Paths are absolute within /api/learning (this router mounts at "/") so no
 * handler sits at a sub-router root (Hono root-path gotcha).
 */
import { Hono } from "hono";
import type { Context } from "hono";
import { z } from "zod";
import type { AppEnv } from "../../types/index.js";
import { success, error } from "../../types/index.js";
import { LEARNING_GOAL_STATUSES } from "../../db/schema/learning.js";
import { createLLMClient, hasAnyLLMProviderKey } from "../../services/adapters/llm-client.js";
import {
  createGoal,
  deleteGoal,
  generatePathFromGoal,
  listGoals,
  recommendForGoal,
  updateGoal,
} from "../../services/learning/learning-goals-service.js";

export const goalRoutes = new Hono<AppEnv>();

const CreateGoalSchema = z.object({
  goalText: z.string().min(2).max(280),
  source: z.enum(["onboarding", "manual"]).default("manual"),
});

const UpdateGoalSchema = z.object({
  goalText: z.string().min(2).max(280).optional(),
  status: z.enum(LEARNING_GOAL_STATUSES).optional(),
});

/** LLM client for re-rank / path planning, or null when no provider key. */
function goalLlm(c: Context<AppEnv>) {
  return hasAnyLLMProviderKey(c.env as any) ? createLLMClient(c.env as any, c.var.user ?? null) : null;
}

goalRoutes.get("/goals/me", async (c) => {
  const userId = c.var.user?.sub;
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  return c.json(success(await listGoals(userId)), 200);
});

goalRoutes.post("/goals", async (c) => {
  const userId = c.var.user?.sub;
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  const parsed = CreateGoalSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    return c.json(error("VALIDATION_ERROR", "Invalid request", parsed.error.flatten()), 400);
  }
  return c.json(success(await createGoal(userId, parsed.data.goalText, parsed.data.source)), 201);
});

goalRoutes.patch("/goals/:id", async (c) => {
  const userId = c.var.user?.sub;
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  const parsed = UpdateGoalSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    return c.json(error("VALIDATION_ERROR", "Invalid request", parsed.error.flatten()), 400);
  }
  const updated = await updateGoal(userId, c.req.param("id"), parsed.data);
  if (!updated) return c.json(error("NOT_FOUND", "Goal not found"), 404);
  return c.json(success(updated), 200);
});

goalRoutes.delete("/goals/:id", async (c) => {
  const userId = c.var.user?.sub;
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  const deleted = await deleteGoal(userId, c.req.param("id"));
  if (!deleted) return c.json(error("NOT_FOUND", "Goal not found"), 404);
  return c.json(success({ deleted: true }), 200);
});

goalRoutes.get("/goals/:id/recommendations", async (c) => {
  const userId = c.var.user?.sub;
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  const items = await recommendForGoal(userId, c.req.param("id"), goalLlm(c));
  if (!items) return c.json(error("NOT_FOUND", "Goal not found"), 404);
  return c.json(success(items), 200);
});

goalRoutes.post("/goals/:id/generate-path", async (c) => {
  const userId = c.var.user?.sub;
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  const result = await generatePathFromGoal(userId, c.req.param("id"), goalLlm(c));
  if (result.kind === "not_found") return c.json(error("NOT_FOUND", "Goal not found"), 404);
  if (result.kind === "no_courses") {
    return c.json(error("NO_COURSES", "No published courses match this goal yet"), 422);
  }
  if (result.kind !== "created") return c.json(error("INTERNAL_ERROR", "Something went wrong."), 500);
  return c.json(
    success({ path: result.path, courseCount: result.courseCount, generatedByLlm: result.generatedByLlm }),
    201,
  );
});
