/**
 * Predictive Assessments API — Big Five, cognitive sample, SJT, EQ, DISC,
 * and resume↔role match. Distinct from /api/assessments (skills tests).
 *
 *   GET    /api/predictive-assessments/kinds                  catalog (public)
 *   GET    /api/predictive-assessments/kinds/:kind/questions  question bank (auth + tier gated)
 *   POST   /api/predictive-assessments/start                  start a run for {kind}
 *   POST   /api/predictive-assessments/:id/respond            append one response
 *   POST   /api/predictive-assessments/:id/complete           finalise + score
 *   GET    /api/predictive-assessments/runs                   history (most recent first)
 *   GET    /api/predictive-assessments/runs/:id               single run with full results
 *   POST   /api/predictive-assessments/resume-match           resume→predictive-index match
 *
 * Tier gating: free kinds (big_five, cognitive_sample) are open to any
 * authenticated user. Pro kinds (situational_judgment, EQ, DISC, resume
 * match) require an active Pro subscription at run-start; the row records
 * `is_pro_run=true` so we can audit later if a downgrade happens.
 *
 * Lifecycle + scoring: services/assessments/predictiveRuns.ts; data access:
 * repositories/assessmentRunsRepository.ts.
 */

import { Hono } from "hono";
import { z } from "zod";
import type { AppEnv } from "../types/index.js";
import { error, success } from "../types/index.js";
import {
  ASSESSMENT_KINDS,
  getAssessmentDescriptor,
  isAssessmentKind,
} from "../../../shared/assessments/kinds.js";
import { getQuestionBank } from "../../../shared/assessments/question-banks.js";
import {
  completePredictiveRun,
  getPredictiveRun,
  isProEligible,
  listPredictiveRuns,
  matchResumeToPredictiveIndex,
  respondToPredictiveRun,
  startPredictiveRun,
} from "../services/assessments/predictiveRuns.js";
import { requireUser } from "./helpers/routerHelpers.js";
import { validateJson } from "./helpers/validate.js";

export const predictiveAssessmentRoutes = new Hono<AppEnv>();

// ---------------------------------------------------------------------------
// Catalog
// ---------------------------------------------------------------------------

predictiveAssessmentRoutes.get("/kinds", (c) => {
  return c.json(success(ASSESSMENT_KINDS), 200);
});

predictiveAssessmentRoutes.get("/kinds/:kind/questions", async (c) => {
  const kind = c.req.param("kind");
  if (!isAssessmentKind(kind)) {
    return c.json(error("VALIDATION_ERROR", "Unknown assessment kind"), 400);
  }
  const descriptor = getAssessmentDescriptor(kind);
  if (descriptor.tier === "pro" && !(await isProEligible(c.var.user, c.var.userId))) {
    return c.json(error("PRO_REQUIRED", `${descriptor.title} requires Pro`), 402);
  }
  const questions = getQuestionBank(kind);
  return c.json(success({ descriptor, questions }), 200);
});

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

const StartSchema = z.object({
  kind: z.string().min(1),
});

predictiveAssessmentRoutes.post("/start", validateJson(StartSchema, (e) => error("VALIDATION_ERROR", e.message)), async (c) => {
  const uid = requireUser(c);

  const { kind } = c.req.valid("json");
  if (!isAssessmentKind(kind)) {
    return c.json(error("VALIDATION_ERROR", "Unknown assessment kind"), 400);
  }
  const descriptor = getAssessmentDescriptor(kind);
  const proEligible = await isProEligible(c.var.user, c.var.userId);
  if (descriptor.tier === "pro" && !proEligible) {
    return c.json(error("PRO_REQUIRED", `${descriptor.title} requires Pro`), 402);
  }

  return c.json(success(await startPredictiveRun(uid, kind)), 200);
});

const RespondSchema = z.object({
  questionId: z.string().min(1),
  value: z.union([z.string(), z.number()]),
});

predictiveAssessmentRoutes.post("/:id/respond", validateJson(RespondSchema, (e) => error("VALIDATION_ERROR", e.message)), async (c) => {
  const uid = requireUser(c);
  const { questionId, value } = c.req.valid("json");
  const updated = await respondToPredictiveRun(uid, c.req.param("id"), { questionId, value });
  return c.json(success(updated), 200);
});

predictiveAssessmentRoutes.post("/:id/complete", async (c) => {
  const uid = requireUser(c);
  return c.json(success(await completePredictiveRun(uid, c.req.param("id"))), 200);
});

// ---------------------------------------------------------------------------
// History
// ---------------------------------------------------------------------------

predictiveAssessmentRoutes.get("/runs", async (c) => {
  const uid = requireUser(c);
  const rows = await listPredictiveRuns(uid);
  return c.json(success(rows), 200);
});

predictiveAssessmentRoutes.get("/runs/:id", async (c) => {
  const uid = requireUser(c);
  return c.json(success(await getPredictiveRun(uid, c.req.param("id"))), 200);
});

// ---------------------------------------------------------------------------
// Resume → predictive index match (Pro)
// ---------------------------------------------------------------------------

const ResumeMatchSchema = z.object({
  resumeText: z.string().min(50).max(60_000),
  roleTitle: z.string().min(1).max(255).optional(),
  roleDescription: z.string().max(20_000).optional(),
});

predictiveAssessmentRoutes.post("/resume-match", validateJson(ResumeMatchSchema, (e) => error("VALIDATION_ERROR", e.message)), async (c) => {
  const uid = requireUser(c);
  if (!(await isProEligible(c.var.user, c.var.userId))) {
    return c.json(error("PRO_REQUIRED", "Resume → predictive index match is a Pro feature"), 402);
  }
  const result = await matchResumeToPredictiveIndex(uid, c.req.valid("json"));
  return c.json(success(result), 200);
});
