/**
 * Synchronous bulk resume scoring — recruiter selects N candidate resumes
 * and a target job, gets a ranked score per resume in a single response.
 *
 * Heuristic-based v1 (no LLM call): scores skill overlap and title-keyword
 * match. Predictable + free; the existing /api/recruiter/match/score-candidates
 * queue path is for richer LLM scoring when the user wants that.
 *
 * Closes audit gap #5 (bulk resume scoring & screening was missing).
 */
import { Hono } from "hono";
import { z } from "zod";
import { UuidLikeSchema } from "../../../shared/validation.js";
import type { AppEnv } from "../types/index.js";
import { success, error } from "../types/index.js";
import { bulkScoreResumes } from "../services/recruit/bulk-scoring.js";
import { requireUser } from "./helpers/routerHelpers.js";
import { validateJson } from "./helpers/validate.js";

export const bulkScoringRoutes = new Hono<AppEnv>();

const BulkScoreSchema = z.object({
  resumeIds: z.array(UuidLikeSchema).min(1).max(200),
  jobId: UuidLikeSchema,
  /** Optional weight overrides — defaults sum to 100 to keep the score
   *  capped at 0–100. The frontend doesn't expose these yet; they exist
   *  so a future Strategy / config-driven scorer can swap in cleanly. */
  weights: z
    .object({
      skill: z.number().min(0).max(100).default(70),
      title: z.number().min(0).max(100).default(20),
      description: z.number().min(0).max(100).default(10),
    })
    .optional(),
});

bulkScoringRoutes.post("/score", validateJson(BulkScoreSchema, (e) => error("VALIDATION_ERROR", "Invalid bulk score request", e.flatten()), { emptyBody: null }), async (c) => {
  const userId = requireUser(c);
  return c.json(success(await bulkScoreResumes(userId, c.req.valid("json"))), 200);
});
