/**
 * sentiment — ONE tool for what were four routes (/sentiment/sentimentprediction,
 * /sentiment/resume/sentimentprediction, /api/resumes/sentimentprediction,
 * /api/jobs/sentimentprediction). All score through shared/sentiment.ts, so
 * identical text scores identically wherever it came from.
 *
 *   { text }      pasted text — nothing persisted (the score lives in tool-run history)
 *   { resumeId }  the caller's résumé — score persisted on the row
 *   { jobId }     a saved job — score persisted on job_items.sentiment_score
 */
import { z } from "zod";
import { scoreSentiment } from "../../../../../shared/sentiment.js";
import { DomainError } from "../../../domains/errors.js";
import { getDb } from "../../../db/index.js";
import { logger } from "../../../lib/logger.js";
import { buildRepos } from "../../../repositories/index.js";
import { success } from "../../../types/index.js";
import { handleJobSentimentPrediction } from "../../job/job-sentiment-handler.js";
import { resumeContentToText } from "../../resume/parse.js";
import { defineAiTool, failTool } from "../types.js";

const SentimentRequestSchema = z
  .object({ text: z.string().optional(), resumeId: z.string().min(1).optional(), jobId: z.string().min(1).optional() })
  .refine((v) => typeof v.text === "string" || v.resumeId || v.jobId, { message: "Send text, resumeId or jobId" });

async function scoreResume(resumeId: string, ownerId: string): Promise<{ score: number }> {
  const repo = buildRepos(getDb()).resumes;
  const row = await repo.findByIdForOwner(resumeId, ownerId);
  if (!row) throw new DomainError(404, "NOT_FOUND", "Resume not found");
  const score = scoreSentiment(resumeContentToText(row.content));
  try {
    await repo.updateSentimentScoreForOwner(resumeId, ownerId, Math.round(score));
  } catch (err) {
    logger.warn("[sentiment] resume persist failed", err);
  }
  return { score };
}

export const sentimentTool = defineAiTool({
  id: "sentiment",
  schema: SentimentRequestSchema,
  tokenBudget: "none",
  handler: async (c, input) => {
    try {
      if (input.resumeId) return c.json(success(await scoreResume(input.resumeId, c.var.user.sub as string)), 200);
      if (input.jobId) {
        return c.json(success(await handleJobSentimentPrediction({ jobs: buildRepos(getDb()).jobs }, { jobId: input.jobId })), 200);
      }
      return c.json(success({ score: scoreSentiment(input.text ?? "") }), 200);
    } catch (err) {
      if (err instanceof DomainError) return failTool(c, err);
      throw err;
    }
  },
});
