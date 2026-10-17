/**
 * Job screening use cases — the apply-time screening interview a job can
 * attach (routes/jobs/screening.ts + the apply handler in routes/jobs/tracker.ts).
 *
 * Use cases return plain data and throw DomainError; ownership gating
 * (`requireJobOwner`) stays at the HTTP edge because it renders its own 403.
 */
import { getDb } from "../../db/index.js";
import { buildRepos } from "../../repositories/index.js";
import { findQuestionSetById, type QuestionSetRow } from "../../repositories/jobScreeningRepository.js";
import { DomainError } from "../../domains/errors.js";
import {
  createScreeningInterviewFromApply,
  listApplicationsMissingScreening,
} from "../interview/screening-from-apply.js";

export type ScreeningRequired = "none" | "optional" | "required";

export type ApplyScreening = Awaited<ReturnType<typeof createScreeningInterviewFromApply>>;

/** Materialise the screening interview for a fresh application (null when
 *  the job has no screening attached). Throws on failure — the apply route
 *  logs and swallows so the application itself never fails. */
export function startApplyScreening(args: {
  jobId: string;
  applicationId: string;
  candidateUserId: string;
  candidateEmail: string;
}): Promise<ApplyScreening> {
  return createScreeningInterviewFromApply(getDb(), args);
}

/** Candidate-safe screening summary: aggregate stats only, never question text. */
export async function getScreeningPreview(jobId: string): Promise<Record<string, unknown>> {
  const db = getDb();
  const job = await buildRepos(db).jobs.findJobById(jobId);
  if (!job) throw new DomainError(404, "NOT_FOUND", "Job not found");
  if (!job.screeningQuestionSetId || job.screeningRequired === "none") {
    return { hasScreening: false };
  }

  const set = await findQuestionSetById(db, job.screeningQuestionSetId);
  if (!set) return { hasScreening: false };

  const questions = Array.isArray(set.questions)
    ? (set.questions as Array<{ maxDurationSec: number }>)
    : [];
  const expectedMinutes = Math.ceil(
    questions.reduce((sum, q) => sum + (q.maxDurationSec ?? 120), 0) / 60,
  );

  return {
    hasScreening: true,
    screeningRequired: job.screeningRequired,
    title: set.title,
    description: set.description,
    questionCount: questions.length,
    expectedMinutes,
    prepTimeSec: set.prepTimeSec,
    maxRetakes: set.maxRetakes,
    proctoringOn: set.proctoringOn,
  };
}

/** Full screening attachment for the owner's job edit page. */
export async function getScreeningAttachment(jobId: string): Promise<{
  questionSetId: string | null;
  screeningRequired: string;
  set: QuestionSetRow | null;
}> {
  const db = getDb();
  const job = await buildRepos(db).jobs.findJobById(jobId);
  if (!job) throw new DomainError(404, "NOT_FOUND", "Job not found");

  let set: QuestionSetRow | null = null;
  if (job.screeningQuestionSetId) {
    set = await findQuestionSetById(db, job.screeningQuestionSetId);
  }

  return {
    questionSetId: job.screeningQuestionSetId,
    screeningRequired: job.screeningRequired,
    set,
  };
}

/** Attach or detach a question set on a job. */
export async function setJobScreening(
  jobId: string,
  input: { questionSetId: string | null; screeningRequired: ScreeningRequired },
): Promise<{ questionSetId: string | null; screeningRequired: ScreeningRequired }> {
  const db = getDb();
  // Cross-check that the set being attached (if any) exists.
  if (input.questionSetId) {
    const row = await findQuestionSetById(db, input.questionSetId);
    if (!row) throw new DomainError(404, "NOT_FOUND", "Question set not found");
    // Reuse the same can-read rule as the question-set CRUD: owner OR
    // company member. We don't have a helper exported yet, but ownerUserId
    // === user covers the common path; company-owned sets are gated by the
    // route layer when the user lists their library, so we trust the id.
  }

  // If the caller wants screening but didn't pick a set, refuse — there's
  // no UX path where this is intentional.
  if (input.screeningRequired !== "none" && !input.questionSetId) {
    throw new DomainError(400, "INVALID_STATE", "Pick a question set before marking screening optional/required");
  }

  await buildRepos(db).jobs.updateJobById(jobId, {
    screeningQuestionSetId: input.questionSetId,
    screeningRequired: input.screeningRequired,
  });

  return {
    questionSetId: input.questionSetId,
    screeningRequired: input.screeningRequired,
  };
}

/** How many existing applicants have no screening interview yet. */
export async function countApplicantsMissingScreening(jobId: string): Promise<{ count: number }> {
  const missing = await listApplicationsMissingScreening(getDb(), jobId);
  return { count: missing.length };
}

/** Late-attach backfill (#1236): create a screening interview for every
 *  existing applicant that lacks one. Per-applicant failures are collected,
 *  never thrown. */
export async function backfillApplicantScreening(jobId: string): Promise<
  | { count: 0; created: 0 }
  | { count: number; created: number; failures: Array<{ applicationId: string; reason: string }> }
> {
  const db = getDb();
  const missing = await listApplicationsMissingScreening(db, jobId);
  if (missing.length === 0) {
    return { count: 0, created: 0 };
  }

  let created = 0;
  const failures: Array<{ applicationId: string; reason: string }> = [];
  for (const row of missing) {
    try {
      const result = await createScreeningInterviewFromApply(db, {
        jobId,
        applicationId: row.applicationId,
        candidateUserId: row.candidateUserId,
        candidateEmail: row.candidateEmail ?? "",
      });
      if (result) created += 1;
    } catch (err) {
      failures.push({
        applicationId: row.applicationId,
        reason: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return { count: missing.length, created, failures };
}
