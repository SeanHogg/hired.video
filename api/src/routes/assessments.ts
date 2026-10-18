// assessments.ts — Candidate skills assessments (#76)
// Timed, AI-graded skills tests that appear as badges on candidate profiles.
// Data access: repositories/skillAssessmentsRepository.ts; attempt flow:
// services/assessments/skillAssessments.ts.

import { Hono } from "hono";
import type { AppEnv } from "../types/index.js";
import { success, error } from "../types/index.js";
import { SkillAssessmentsRepository } from "../repositories/skillAssessmentsRepository.js";
import { startAssessmentAttempt, submitAssessmentAttempt } from "../services/assessments/skillAssessments.js";
import { requireUser } from "./helpers/routerHelpers.js";

export const assessmentRoutes = new Hono<AppEnv>();

// ─── Public: browse available assessments ────────────────────────────────────

/** GET /api/assessments — list active assessments; optionally filter by ?skill= */
assessmentRoutes.get("/", async (c) => {
  const rows = await new SkillAssessmentsRepository().listActiveSummaries(c.req.query("skill"));
  return c.json(success(rows), 200);
});

/** GET /api/assessments/:slug — assessment detail (questions hidden until started) */
assessmentRoutes.get("/:slug", async (c) => {
  const row = await new SkillAssessmentsRepository().findActiveSummaryBySlug(c.req.param("slug"));
  if (!row) return c.json(error("NOT_FOUND", "Assessment not found"), 404);
  return c.json(success(row), 200);
});

// ─── Candidate attempt flow ───────────────────────────────────────────────────

/** POST /api/assessments/:slug/start — start a new attempt */
assessmentRoutes.post("/:slug/start", async (c) => {
  const userId = requireUser(c);
  const started = await startAssessmentAttempt(userId, c.req.param("slug"));
  return c.json(success(started), 201);
});

/** POST /api/assessments/attempts/:attemptId/submit — submit answers for grading */
assessmentRoutes.post("/attempts/:attemptId/submit", async (c) => {
  const userId = requireUser(c);
  const body = await c.req.json().catch(() => ({}));
  const answers: Record<string, string | number> = body.answers ?? {};
  const result = await submitAssessmentAttempt(userId, c.req.param("attemptId"), answers, {
    env: c.env,
    user: c.var.user,
  });
  return c.json(success(result), 200);
});

/** GET /api/assessments/me/results — all completed attempts for the logged-in user */
assessmentRoutes.get("/me/results", async (c) => {
  const userId = requireUser(c);
  const rows = await new SkillAssessmentsRepository().listCompletedResultsForUser(userId);
  return c.json(success(rows), 200);
});

/** GET /api/assessments/users/:userId/badges — public passed assessments for a profile */
assessmentRoutes.get("/users/:userId/badges", async (c) => {
  const rows = await new SkillAssessmentsRepository().listPassedBadgesForUser(c.req.param("userId"));
  return c.json(success(rows), 200);
});
