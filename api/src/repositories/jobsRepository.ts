/**
 * JobsRepository — covers the job-posting aggregate (jobItems) plus the
 * two small join/activity tables that belong to it: jobApplications and
 * savedJobs. These three are co-owned because they have one-to-many
 * cardinality back to jobItems and are always queried together on the
 * seeker's dashboard. job_applications is READ-only here: the single
 * writer is jobApplicationTrackerRepository (one application per user+job).
 *
 * Every direct Drizzle call against these tables outside the repository
 * module is a layering violation.
 */

import { and, count, desc, eq, gte, ilike, inArray, or, sql } from "drizzle-orm";
import { schema } from "../db/index.js";

const {
  jobItems,
  jobApplications,
  savedJobs,
  resumeMatchScores,
} = schema;

export type DbLike = any;

const JOB_BRIEF_COLUMNS = {
  id: jobItems.id,
  title: jobItems.title,
  description: jobItems.description,
  company: jobItems.company,
  location: jobItems.location,
};

export type JobRow = typeof jobItems.$inferSelect;
export type JobInsert = typeof jobItems.$inferInsert;
export type JobApplicationRow = typeof jobApplications.$inferSelect;
export type SavedJobRow = typeof savedJobs.$inferSelect;
export type ResumeMatchScoreRow = typeof resumeMatchScores.$inferSelect;
export type ResumeMatchScoreInsert = typeof resumeMatchScores.$inferInsert;

export interface JobBrief {
  id: string;
  title: string;
  description: string;
  company: string | null;
  location: string | null;
}

export interface JobSearchFilters {
  search?: string;
  isActive?: boolean;
}

/** jobItems reads. */
export interface IJobReader {
  findJobById(id: string): Promise<JobRow | null>;
  findJobsByIds(ids: string[]): Promise<JobRow[]>;
  listActiveJobs(limit?: number): Promise<JobRow[]>;
  /** Narrow {id,title,description,company,location} rows for AI tailoring/ranking. */
  findJobBriefsByIds(ids: string[]): Promise<JobBrief[]>;
  /** Up to `limit` active jobs (newest first) as briefs. */
  listActiveJobBriefs(limit: number): Promise<JobBrief[]>;
  /** {id,title,description,skillsRequired} for heuristic résumé scoring; null when missing. */
  findJobScoringBrief(id: string): Promise<Pick<JobRow, "id" | "title" | "description" | "skillsRequired"> | null>;
  /** The job's poster (`ownerId` null for unowned postings); null when the job doesn't exist. */
  findJobOwner(id: string): Promise<{ ownerId: string | null } | null>;
  searchJobs(filters: JobSearchFilters, limit?: number): Promise<JobRow[]>;
  countJobs(): Promise<number>;
  countActiveJobs(): Promise<number>;
  countJobsCreatedSince(since: Date): Promise<number>;
  /** Subset of `urls` already present as `job_items.source_url` (one query). */
  findExistingSourceUrls(urls: string[]): Promise<Set<string>>;
}

/** jobItems writes. */
export interface IJobWriter {
  insertJob(input: JobInsert): Promise<JobRow>;
  /** ONE multi-row INSERT (atomic); returns rows written. Throws on
   *  failure — callers chunk (~500 rows) and fall back to `insertJob` for
   *  per-row isolation. */
  insertJobsBulk(inputs: JobInsert[]): Promise<number>;
  updateJobById(id: string, patch: Partial<JobInsert>): Promise<JobRow | null>;
  updateJobSentimentScore(id: string, sentimentScore: number): Promise<void>;
  deleteJobById(id: string): Promise<boolean>;
}

/** job applications. */
export interface IJobApplicationStore {
  findApplicationById(id: string): Promise<JobApplicationRow | null>;
  findApplicationsForUser(userId: string): Promise<JobApplicationRow[]>;
  countApplications(): Promise<number>;
  countApplicationsCreatedSince(since: Date): Promise<number>;
}

/** saved jobs (seeker tracker bookmarks). */
export interface ISavedJobStore {
  findSavedForUser(userId: string): Promise<SavedJobRow[]>;
  /** True when `jobId` is in `userId`'s tracker (saved_jobs row exists). */
  isJobSavedByUser(userId: string, jobId: string): Promise<boolean>;
  removeSaved(userId: string, jobId: string): Promise<void>;
}

/** resume↔job match scores (seeker-initiated matching). */
export interface IResumeMatchStore {
  findResumeMatchByPair(resumeId: string, jobId: string): Promise<ResumeMatchScoreRow | null>;
  upsertResumeMatch(input: ResumeMatchScoreInsert): Promise<void>;
}

export interface IJobsRepository
  extends IJobReader,
    IJobWriter,
    IJobApplicationStore,
    ISavedJobStore,
    IResumeMatchStore {}

export class JobsRepository implements IJobsRepository {
  constructor(private readonly db: DbLike, private readonly now: () => Date = () => new Date()) {}

  // ── jobItems ──────────────────────────────────────────────────────────────

  async findJobById(id: string): Promise<JobRow | null> {
    const [row] = await this.db.select().from(jobItems).where(eq(jobItems.id, id)).limit(1);
    return (row as JobRow) ?? null;
  }

  async findExistingSourceUrls(urls: string[]): Promise<Set<string>> {
    const unique = [...new Set(urls)];
    if (unique.length === 0) return new Set();
    const rows: Array<{ sourceUrl: string | null }> = await this.db
      .select({ sourceUrl: jobItems.sourceUrl })
      .from(jobItems)
      .where(inArray(jobItems.sourceUrl, unique));
    return new Set(rows.map((r) => r.sourceUrl).filter((u): u is string => u != null));
  }

  async insertJobsBulk(inputs: JobInsert[]): Promise<number> {
    if (inputs.length === 0) return 0;
    await this.db.insert(jobItems).values(inputs);
    return inputs.length;
  }

  async findJobsByIds(ids: string[]): Promise<JobRow[]> {
    if (ids.length === 0) return [];
    return (await this.db.select().from(jobItems).where(inArray(jobItems.id, ids))) as JobRow[];
  }

  async listActiveJobs(limit = 100): Promise<JobRow[]> {
    return (await this.db
      .select()
      .from(jobItems)
      .where(eq(jobItems.isActive, true))
      .orderBy(desc(jobItems.createdAt))
      .limit(Math.min(500, Math.max(1, limit)))) as JobRow[];
  }

  async findJobBriefsByIds(ids: string[]): Promise<JobBrief[]> {
    if (ids.length === 0) return [];
    return (await this.db.select(JOB_BRIEF_COLUMNS).from(jobItems).where(inArray(jobItems.id, ids))) as JobBrief[];
  }

  async listActiveJobBriefs(limit: number): Promise<JobBrief[]> {
    return (await this.db
      .select(JOB_BRIEF_COLUMNS)
      .from(jobItems)
      .where(eq(jobItems.isActive, true))
      .orderBy(desc(jobItems.createdAt))
      .limit(limit)) as JobBrief[];
  }

  async findJobScoringBrief(id: string): Promise<Pick<JobRow, "id" | "title" | "description" | "skillsRequired"> | null> {
    const [row] = await this.db
      .select({
        id: jobItems.id,
        title: jobItems.title,
        description: jobItems.description,
        skillsRequired: jobItems.skillsRequired,
      })
      .from(jobItems)
      .where(eq(jobItems.id, id))
      .limit(1);
    return row ?? null;
  }

  async findJobOwner(id: string): Promise<{ ownerId: string | null } | null> {
    const [row] = await this.db
      .select({ ownerId: jobItems.postedByUserId })
      .from(jobItems)
      .where(eq(jobItems.id, id))
      .limit(1);
    return row ?? null;
  }

  async searchJobs(filters: JobSearchFilters, limit = 100): Promise<JobRow[]> {
    const conds = [] as any[];
    if (filters.isActive !== undefined) conds.push(eq(jobItems.isActive, filters.isActive));
    if (filters.search) {
      conds.push(
        or(
          ilike(jobItems.title, `%${filters.search}%`),
          ilike(jobItems.description, `%${filters.search}%`),
          ilike(jobItems.company, `%${filters.search}%`),
        ),
      );
    }
    const where = conds.length > 0 ? and(...conds) : undefined;
    return (await this.db
      .select()
      .from(jobItems)
      .where(where)
      .orderBy(desc(jobItems.createdAt))
      .limit(Math.min(500, Math.max(1, limit)))) as JobRow[];
  }

  async countJobs(): Promise<number> {
    const [row] = await this.db.select({ n: count() }).from(jobItems);
    return Number(row?.n ?? 0);
  }

  async countActiveJobs(): Promise<number> {
    const [row] = await this.db.select({ n: count() }).from(jobItems).where(eq(jobItems.isActive, true));
    return Number(row?.n ?? 0);
  }

  async countJobsCreatedSince(since: Date): Promise<number> {
    const [row] = await this.db.select({ n: count() }).from(jobItems).where(gte(jobItems.createdAt, since));
    return Number(row?.n ?? 0);
  }

  async insertJob(input: JobInsert): Promise<JobRow> {
    const [created] = await this.db.insert(jobItems).values(input as any).returning();
    return created as JobRow;
  }

  async updateJobById(id: string, patch: Partial<JobInsert>): Promise<JobRow | null> {
    const [updated] = await this.db
      .update(jobItems)
      .set({ ...patch, updatedAt: this.now() } as any)
      .where(eq(jobItems.id, id))
      .returning();
    return (updated as JobRow) ?? null;
  }

  async deleteJobById(id: string): Promise<boolean> {
    const existing = await this.findJobById(id);
    if (!existing) return false;
    await this.db.delete(jobItems).where(eq(jobItems.id, id));
    return true;
  }

  /** Fire-and-forget sentiment persist for a job. Mirrors
   *  `ResumeRepository.updateSentimentScoreForOwner` but without the
   *  owner clause — jobs are public artifacts whose tone score is a
   *  function of their description text, so anyone running the
   *  sentiment tool refreshes the same column. Callers wrap this in
   *  try/catch — a write failure must not fail the whole response. */
  async updateJobSentimentScore(id: string, sentimentScore: number): Promise<void> {
    await this.db
      .update(jobItems)
      .set({ sentimentScore, updatedAt: this.now() } as any)
      .where(eq(jobItems.id, id));
  }

  // ── job applications ──────────────────────────────────────────────────────

  async findApplicationById(id: string): Promise<JobApplicationRow | null> {
    const [row] = await this.db.select().from(jobApplications).where(eq(jobApplications.id, id)).limit(1);
    return (row as JobApplicationRow) ?? null;
  }

  async findApplicationsForUser(userId: string): Promise<JobApplicationRow[]> {
    return (await this.db
      .select()
      .from(jobApplications)
      .where(eq(jobApplications.userId, userId))
      .orderBy(desc(jobApplications.createdAt))) as JobApplicationRow[];
  }

  async countApplications(): Promise<number> {
    const [row] = await this.db.select({ n: count() }).from(jobApplications);
    return Number(row?.n ?? 0);
  }

  async countApplicationsCreatedSince(since: Date): Promise<number> {
    const [row] = await this.db.select({ n: count() }).from(jobApplications).where(gte(jobApplications.createdAt, since));
    return Number(row?.n ?? 0);
  }

  // ── saved jobs ────────────────────────────────────────────────────────────

  async countSavedForUser(userId: string): Promise<number> {
    const [row] = await this.db.select({ n: count() }).from(savedJobs).where(eq(savedJobs.userId, userId));
    return Number(row?.n ?? 0);
  }

  async findSavedForUser(userId: string): Promise<SavedJobRow[]> {
    return (await this.db.select().from(savedJobs).where(eq(savedJobs.userId, userId))) as SavedJobRow[];
  }

  async isJobSavedByUser(userId: string, jobId: string): Promise<boolean> {
    const [row] = await this.db
      .select({ jobId: savedJobs.jobId })
      .from(savedJobs)
      .where(and(eq(savedJobs.userId, userId), eq(savedJobs.jobId, jobId)))
      .limit(1);
    return Boolean(row);
  }

  async removeSaved(userId: string, jobId: string): Promise<void> {
    await this.db
      .delete(savedJobs)
      .where(and(eq(savedJobs.userId, userId), eq(savedJobs.jobId, jobId)));
  }

  // ── resume↔job match scores ───────────────────────────────────────────────

  async findResumeMatchByPair(resumeId: string, jobId: string): Promise<ResumeMatchScoreRow | null> {
    const [row] = await this.db
      .select()
      .from(resumeMatchScores)
      .where(and(
        eq(resumeMatchScores.resumeId, resumeId),
        eq(resumeMatchScores.jobId, jobId),
      ))
      .limit(1);
    return (row as ResumeMatchScoreRow) ?? null;
  }

  async upsertResumeMatch(input: ResumeMatchScoreInsert): Promise<void> {
    await this.db.insert(resumeMatchScores).values(input as any);
  }

  // Keep `sql` import alive for future aggregate queries.
  private readonly _sqlPinned = sql;
}
