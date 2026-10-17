/**
 * W2-1 owns this — moving to the AI-tools dispatcher. Moved verbatim out of
 * routes/jobs.ts during the jobs god-route split; logic intentionally
 * unchanged (including its direct getDb()).
 */
import { Hono } from "hono";
import type { AppEnv } from "../../types/index.js";
import { getDb } from "../../db/index.js";
import { handleJobSentimentPrediction } from "../../services/job/job-sentiment-handler.js";
import { toHandlerResult } from "../../handlers/shared.js";
import { buildRepos } from "../../repositories/index.js";
import { attachTokenBudget } from "../../middleware/tierEnforcement.js";

export const jobSentimentRoutes = new Hono<AppEnv>();

/**
 * POST /api/jobs/sentimentprediction — score the sentiment of a saved
 * job's description and persist on `job_items.sentiment_score`. Body:
 * `{ jobId }`. Pasted-text scoring goes through /sentiment/sentimentprediction
 * (see routes/sentiment.ts) and never lands here.
 */
jobSentimentRoutes.post("/sentimentprediction", attachTokenBudget(), async (c) => {
  const body = await c.req.json().catch(() => null);
  const result = await toHandlerResult(handleJobSentimentPrediction(
    { jobs: buildRepos(getDb()).jobs },
    body,
  ));
  return c.json(result.body as any, result.status as any);
});
