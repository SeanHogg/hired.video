/**
 * Recruiter submissions board — the agency recruiter's kanban over their
 * candidate_submissions, bucketed by submission status into sourcing stages
 * and stamped with the recruiter's match score. Served at
 * `GET /api/pipeline/submissions` (legacy recruiter side-panel extension).
 *
 * Distinct data source from the job pipeline board (job_pipeline_entries),
 * so it is a separate read rather than a duplicate of `listBoardByStage`.
 */
import { getDb } from "../../db/index.js";
import { RecruiterPipelineRepository, matchScoreKey } from "../../repositories/recruiterPipelineRepository.js";
import { SUBMISSION_STATUSES, isStatus, type SubmissionStatus } from "../../../../shared/statuses.js";

export const SUBMISSION_BOARD_STAGES = ["sourced", "contacted", "screening", "interview", "offer", "placed"] as const;
export type SubmissionBoardStage = (typeof SUBMISSION_BOARD_STAGES)[number];

/** SUBMISSION_STATUSES (shared/statuses.ts) → board column. Statuses with no
 *  column (rejected / withdrawn) fall back to "sourced", as before. */
const STATUS_TO_STAGE: Partial<Record<SubmissionStatus, SubmissionBoardStage>> = {
  submitted: "sourced",
  reviewed: "contacted",
  screening: "screening",
  interviewing: "interview",
  offer: "offer",
  placed: "placed",
};

export interface SubmissionBoardCard {
  id: string;
  candidateId: string;
  candidateName: string;
  candidateEmail: string | null;
  jobId: string | null;
  jobTitle: string | null;
  companyName: string | null;
  status: string;
  score: number | null;
  submittedAt: string;
  updatedAt: string;
}

export async function buildSubmissionsBoard(
  recruiterId: string,
): Promise<Record<SubmissionBoardStage, SubmissionBoardCard[]>> {
  const repo = new RecruiterPipelineRepository(getDb());
  // Bounded (PIPELINE_SUBMISSIONS_LIMIT, most recently updated first).
  const submissions = await repo.findSubmissionsForRecruiter(recruiterId);
  // One read for every (job, candidate) score instead of one per submission.
  const scores = await repo.findMatchScoresForJobs(
    recruiterId,
    Array.from(new Set(submissions.map((s) => s.jobId).filter((id): id is string => Boolean(id)))),
  );

  const stages = Object.fromEntries(
    SUBMISSION_BOARD_STAGES.map((s) => [s, [] as SubmissionBoardCard[]]),
  ) as Record<SubmissionBoardStage, SubmissionBoardCard[]>;

  for (const sub of submissions) {
    const stage = (isStatus(SUBMISSION_STATUSES, sub.status) ? STATUS_TO_STAGE[sub.status] : undefined) ?? "sourced";
    const score = sub.jobId ? scores.get(matchScoreKey(sub.jobId, sub.candidateId)) : undefined;
    stages[stage].push({
      id: sub.id,
      candidateId: sub.candidateId,
      candidateName: sub.candidateName,
      candidateEmail: sub.candidateEmail,
      jobId: sub.jobId,
      jobTitle: sub.jobTitle,
      companyName: sub.companyName,
      status: sub.status,
      score: score ?? null,
      submittedAt: sub.submittedAt.toISOString(),
      updatedAt: sub.updatedAt.toISOString(),
    });
  }
  return stages;
}
