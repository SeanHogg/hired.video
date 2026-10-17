/**
 * Recruiter match scoring use cases: enqueue (re)scoring on the job queue
 * and read the cached recruiter_match_scores. The scoring itself runs in
 * the queue worker (services/company/recruiter-match.ts).
 * Route: routes/recruiter/match.ts.
 */
import { DomainError } from "../../domains/errors.js";
import { signalWork } from "../scheduling/work-signals.js";
import { listActiveEntryIds } from "../../repositories/talentPoolRepository.js";
import { enqueueRecruiterScoringJob, listRecruiterMatchScores } from "../../repositories/recruiterMatchScoresRepository.js";

/** Score every ACTIVE pool candidate against a job (async, 202). */
export async function queueCandidateScoring(recruiterId: string, jobId: unknown) {
  if (!jobId) throw new DomainError(400, "VALIDATION_ERROR", "jobId is required");
  const candidates = await listActiveEntryIds(recruiterId);
  const queueId = await enqueueRecruiterScoringJob({
    type: "recruiter_score_candidates",
    payload: { recruiterId, jobId: jobId as string },
  });
  await signalWork("job-queue");
  return { queueId, candidateCount: candidates.length };
}

/** Score one candidate against all the recruiter's active jobs (async, 202). */
export async function queueJobScoring(recruiterId: string, candidateId: unknown) {
  if (!candidateId) throw new DomainError(400, "VALIDATION_ERROR", "candidateId is required");
  const queueId = await enqueueRecruiterScoringJob({
    type: "recruiter_score_jobs",
    payload: { recruiterId, candidateId: candidateId as string },
  });
  await signalWork("job-queue");
  return { queueId };
}

export async function getMatchScores(recruiterId: string, filters: { jobId?: string; candidateId?: string }) {
  const scores = await listRecruiterMatchScores(recruiterId, filters, 200);
  return {
    scores: scores.map((s) => ({
      id: s.id,
      jobId: s.jobId,
      candidateId: s.candidateId,
      candidateName: s.candidateName,
      jobTitle: s.jobTitle,
      score: s.score,
      recommendations: s.recommendations,
      scoredAt: s.scoredAt.toISOString(),
    })),
  };
}
