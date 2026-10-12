/**
 * RecruiterPipelineRepository — recruiter-scoped reads/writes for the
 * pipeline kanban (candidate_submissions + recruiter_match_scores) and
 * talent-pool bulk tag edits.
 *
 * Set-shaped by design: the pipeline view used to issue one match-score
 * select per submission, and bulk tagging one UPDATE per candidate. Both
 * are now a single statement.
 */
import { and, desc, eq, inArray, sql, type SQL } from "drizzle-orm";
import { schema } from "../db/index.js";

const { candidateSubmissions, recruiterMatchScores, talentPoolCandidates } = schema;

export type DbLike = any;

export type CandidateSubmissionRow = typeof candidateSubmissions.$inferSelect;

/** Upper bound on submissions loaded into the kanban in one request. */
export const PIPELINE_SUBMISSIONS_LIMIT = 500;

/** Map key for a (job, candidate) match score. */
export const matchScoreKey = (jobId: string, candidateId: string): string => `${jobId}|${candidateId}`;

export class RecruiterPipelineRepository {
  constructor(private readonly db: DbLike) {}

  /** Recruiter's submissions, most recently updated first, bounded. */
  async findSubmissionsForRecruiter(
    recruiterId: string,
    limit = PIPELINE_SUBMISSIONS_LIMIT,
  ): Promise<CandidateSubmissionRow[]> {
    return (await this.db
      .select()
      .from(candidateSubmissions)
      .where(eq(candidateSubmissions.recruiterId, recruiterId))
      .orderBy(desc(candidateSubmissions.updatedAt))
      .limit(limit)) as CandidateSubmissionRow[];
  }

  /** Every match score this recruiter has for `jobIds`, keyed by
   *  `matchScoreKey(jobId, candidateId)`. First row per key wins. */
  async findMatchScoresForJobs(recruiterId: string, jobIds: readonly string[]): Promise<Map<string, number>> {
    const out = new Map<string, number>();
    if (jobIds.length === 0) return out;
    const rows = (await this.db
      .select({
        jobId: recruiterMatchScores.jobId,
        candidateId: recruiterMatchScores.candidateId,
        score: recruiterMatchScores.score,
      })
      .from(recruiterMatchScores)
      .where(
        and(
          eq(recruiterMatchScores.recruiterId, recruiterId),
          inArray(recruiterMatchScores.jobId, [...jobIds]),
        ),
      )) as Array<{ jobId: string; candidateId: string; score: number }>;
    for (const r of rows) {
      const key = matchScoreKey(r.jobId, r.candidateId);
      if (!out.has(key)) out.set(key, r.score);
    }
    return out;
  }

  /**
   * Write per-row tag arrays for many talent-pool entries in ONE UPDATE.
   * When every entry gets the same array it is a plain `SET … WHERE id IN`;
   * otherwise a `CASE id WHEN … THEN …::jsonb END` expression. Scoped to
   * the recruiter. Returns the number of rows updated.
   */
  async setTalentPoolTags(
    recruiterId: string,
    updates: ReadonlyArray<{ id: string; tags: string[] }>,
  ): Promise<number> {
    if (updates.length === 0) return 0;
    const ids = updates.map((u) => u.id);
    const serialized = updates.map((u) => JSON.stringify(u.tags));
    const allSame = serialized.every((s) => s === serialized[0]);
    const tagsExpr: SQL | string[] = allSame
      ? updates[0]!.tags
      : sql`CASE ${talentPoolCandidates.id} ${sql.join(
          updates.map((u, i) => sql`WHEN ${u.id}::uuid THEN ${serialized[i]}::jsonb`),
          sql` `,
        )} ELSE ${talentPoolCandidates.tags} END`;
    const rows = (await this.db
      .update(talentPoolCandidates)
      .set({ tags: tagsExpr, updatedAt: new Date() })
      .where(and(inArray(talentPoolCandidates.id, ids), eq(talentPoolCandidates.recruiterId, recruiterId)))
      .returning({ id: talentPoolCandidates.id })) as Array<{ id: string }>;
    return rows.length;
  }
}
