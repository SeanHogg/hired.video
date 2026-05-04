/**
 * Shared resume-score persistence helper. Both the AI Resume Scorer
 * (`/api/resumescorer/score`) and the Resume Optimizer
 * (`/api/resumeoptimizer/optimize`) write to the same `scores` JSONB
 * column on resume_information when the caller passed `{ resumeId }`.
 *
 * When no resumeId is supplied (raw-text upload path), the score is
 * NOT written to any artifact — it lives only in tool-run history
 * (recorded by the frontend's `useToolRunRecorder` hook). That keeps
 * the resume row free of scores from runs that weren't actually about
 * that resume, while still making every run discoverable in history.
 *
 * Wrapped in try/catch by design: a persist failure must never fail
 * the user-visible response.
 */

import { buildRepos } from "../../repositories/index.js";
import { getDb } from "../../db/index.js";

export async function persistResumeScoresIfReferenced(
  body: unknown,
  user: { sub?: string } | undefined,
  scores: Record<string, number>,
): Promise<void> {
  try {
    const resumeId =
      typeof body === "object" && body !== null
        ? (body as { resumeId?: unknown }).resumeId
        : undefined;
    const ownerId = user?.sub;
    if (typeof resumeId === "string" && resumeId.length > 0 && ownerId) {
      const repo = buildRepos(getDb()).resumes;
      await repo.updateScoresForOwner(resumeId, ownerId, scores);
    }
  } catch (err) {
    console.warn(
      "[resume-scores] persist failed:",
      err instanceof Error ? err.message : err,
    );
  }
}
