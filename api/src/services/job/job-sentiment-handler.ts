/**
 * Job sentiment scoring handler — mirror of the résumé branch of the `sentiment` AI tool
 * (services/ai-tools), for job artifacts.
 *
 * Persistence rule (matches the resume side, see persist-scores.ts):
 *   • Pasted job-description text path: scored upstream by
 *     the `sentiment` AI tool with `{ text }`. No artifact
 *     row is touched; the score lives only in tool-run history.
 *   • Saved-job path: this handler. Loads the row, renders text via
 *     `jobRowToLLMText` (shared with the matching tools so a job
 *     scores the same here as it does in /analyze + /bycontent), and
 *     persists the score on `job_items.sentiment_score`.
 *
 * Job rows have no owner clause — the score is a function of the
 * description text, identical for every viewer, so anyone running the
 * tool refreshes the same column.
 */

import { DomainError } from "../../domains/errors.js";
import { scoreSentiment } from "../../../../shared/sentiment.js";
import { jobRowToLLMText } from "./match-text.js";
import type { IJobReader, IJobWriter } from "../../repositories/jobsRepository.js";
import { logger } from "../../lib/logger.js";

export interface JobSentimentDeps {
  jobs: IJobReader & IJobWriter;
}

export async function handleJobSentimentPrediction(
  deps: JobSentimentDeps,
  body: unknown,
): Promise<{ score: number }> {
  const jobId =
    typeof body === "object" && body !== null
      ? (body as { jobId?: unknown }).jobId
      : undefined;

  if (typeof jobId !== "string" || jobId.length === 0) {
    throw new DomainError(400, "VALIDATION_ERROR", "jobId is required");
  }

  const row = await deps.jobs.findJobById(jobId);
  if (!row) throw new DomainError(404, "NOT_FOUND", "Job not found");

  const score = scoreSentiment(jobRowToLLMText(row as Record<string, unknown>));

  try {
    await deps.jobs.updateJobSentimentScore(jobId, Math.round(score));
  } catch (err) {
    logger.warn("[job-sentimentprediction] persist failed", err);
  }

  return { score };
}
