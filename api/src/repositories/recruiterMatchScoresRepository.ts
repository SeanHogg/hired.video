/**
 * RecruiterMatchScoresRepository — cached recruiter match scores
 * (`recruiter_match_scores`) and the queue rows that ask the job-queue
 * worker to (re)compute them (`queue_job_to_process`, types
 * `recruiter_score_candidates` / `recruiter_score_jobs`).
 */
import { and, desc, eq, type SQL } from "drizzle-orm";
import { getDb, schema } from "../db/index.js";

const { recruiterMatchScores, queueJobToProcess } = schema;

export type RecruiterMatchScoreRow = typeof recruiterMatchScores.$inferSelect;
export type QueueJobInsert = typeof queueJobToProcess.$inferInsert;

export type RecruiterScoringJob =
  | { type: "recruiter_score_candidates"; payload: { recruiterId: string; jobId: string } }
  | { type: "recruiter_score_jobs"; payload: { recruiterId: string; candidateId: string } };

/** Enqueue a priority-1 scoring job; returns the queue row id. */
export async function enqueueRecruiterScoringJob(job: RecruiterScoringJob): Promise<string> {
  const values: QueueJobInsert = { type: job.type, payload: job.payload, priority: 1 };
  const [row] = await getDb().insert(queueJobToProcess).values(values).returning();
  return row.id;
}

/** Recruiter's cached scores, optionally narrowed by job / candidate, best first. */
export async function listRecruiterMatchScores(
  recruiterId: string,
  filters: { jobId?: string; candidateId?: string },
  limit = 200,
): Promise<RecruiterMatchScoreRow[]> {
  let condition: SQL = eq(recruiterMatchScores.recruiterId, recruiterId);
  if (filters.jobId) condition = and(condition, eq(recruiterMatchScores.jobId, filters.jobId));
  if (filters.candidateId) condition = and(condition, eq(recruiterMatchScores.candidateId, filters.candidateId));
  return getDb()
    .select()
    .from(recruiterMatchScores)
    .where(condition)
    .orderBy(desc(recruiterMatchScores.score))
    .limit(limit);
}
