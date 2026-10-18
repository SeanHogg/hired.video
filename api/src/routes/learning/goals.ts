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
import { createLLMClient, hasAnyLLMProviderKey } from "../../services/adapters/llm-client.js";
import {
  LEARNING_GOAL_STATUSES,
  createGoal,
  deleteGoal,
  generatePathFromGoal,
  listGoals,
  recommendForGoal,
  updateGoal,
} from "../../services/learning/learning-goals-service.js";
import { requireUser } from "../helpers/routerHelpers.js";
import { validateJson } from "../helpers/validate.js";

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
  const userId = requireUser(c);
  return c.json(success(await listGoals(userId)), 200);
});

goalRoutes.post("/goals", validateJson(CreateGoalSchema, undefined, { emptyBody: null }), async (c) => {
  const userId = requireUser(c);
  const body = c.req.valid("json");
  return c.json(success(await createGoal(userId, body.goalText, body.source)), 201);
});

goalRoutes.patch("/goals/:id", validateJson(UpdateGoalSchema, undefined, { emptyBody: null }), async (c) => {
  const userId = requireUser(c);
  const body = c.req.valid("json");
  const updated = await updateGoal(userId, c.req.param("id"), body);
  if (!updated) return c.json(error("NOT_FOUND", "Goal not found"), 404);
  return c.json(success(updated), 200);
});

goalRoutes.delete("/goals/:id", async (c) => {
  const userId = requireUser(c);
  const deleted = await deleteGoal(userId, c.req.param("id"));
  if (!deleted) return c.json(error("NOT_FOUND", "Goal not found"), 404);
  return c.json(success({ deleted: true }), 200);
});

goalRoutes.get("/goals/:id/recommendations", async (c) => {
  const userId = requireUser(c);
  const items = await recommendForGoal(userId, c.req.param("id"), goalLlm(c));
  if (!items) return c.json(error("NOT_FOUND", "Goal not found"), 404);
  return c.json(success(items), 200);
});

goalRoutes.post("/goals/:id/generate-path", async (c) => {
  const userId = requireUser(c);
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
