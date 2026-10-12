/**
 * JobsRepository — covers the job-posting aggregate (jobItems) plus the
 * two small join/activity tables that belong to it: jobApplications and
 * savedJobs. These three are co-owned because they have one-to-many
 * cardinality back to jobItems and are always queried together on the
 * seeker's dashboard.
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
  jobBoardSources,
  jobBoardPostings,
  jobBoardSyncLog,
  exclusiveBoards,
  boardBids,
} = schema;

export type DbLike = any;

export type JobRow = typeof jobItems.$inferSelect;
export type JobInsert = typeof jobItems.$inferInsert;
export type JobApplicationRow = typeof jobApplications.$inferSelect;
export type JobApplicationInsert = typeof jobApplications.$inferInsert;
export type SavedJobRow = typeof savedJobs.$inferSelect;
export type ResumeMatchScoreRow = typeof resumeMatchScores.$inferSelect;
export type ResumeMatchScoreInsert = typeof resumeMatchScores.$inferInsert;
export type JobBoardSourceRow = typeof jobBoardSources.$inferSelect;
export type JobBoardPostingRow = typeof jobBoardPostings.$inferSelect;
export type JobBoardPostingInsert = typeof jobBoardPostings.$inferInsert;
export type JobBoardSyncLogRow = typeof jobBoardSyncLog.$inferSelect;
export type ExclusiveBoardRow = typeof exclusiveBoards.$inferSelect;
export type BoardBidRow = typeof boardBids.$inferSelect;
export type BoardBidInsert = typeof boardBids.$inferInsert;

export interface JobSearchFilters {
  search?: string;
  isActive?: boolean;
}

export interface IJobsRepository {
  // jobItems reads
  findJobById(id: string): Promise<JobRow | null>;
  findJobsByIds(ids: string[]): Promise<JobRow[]>;
  listActiveJobs(limit?: number): Promise<JobRow[]>;
  searchJobs(filters: JobSearchFilters, limit?: number): Promise<JobRow[]>;
  countJobs(): Promise<number>;
  countActiveJobs(): Promise<number>;
  countJobsCreatedSince(since: Date): Promise<number>;
  /** Subset of `urls` already present as `job_items.source_url` (one query). */
  findExistingSourceUrls(urls: string[]): Promise<Set<string>>;
  // jobItems writes
  insertJob(input: JobInsert): Promise<JobRow>;
  /** ONE multi-row INSERT (atomic); returns rows written. Throws on
   *  failure — callers chunk (~500 rows) and fall back to `insertJob` for
   *  per-row isolation. */
  insertJobsBulk(inputs: JobInsert[]): Promise<number>;
  updateJobById(id: string, patch: Partial<JobInsert>): Promise<JobRow | null>;
  updateJobSentimentScore(id: string, sentimentScore: number): Promise<void>;
  deleteJobById(id: string): Promise<boolean>;
  // job applications
  findApplicationById(id: string): Promise<JobApplicationRow | null>;
  findApplicationsForUser(userId: string): Promise<JobApplicationRow[]>;
  insertApplication(input: JobApplicationInsert): Promise<JobApplicationRow>;
  countApplications(): Promise<number>;
  countApplicationsCreatedSince(since: Date): Promise<number>;
  // saved jobs
  findSavedForUser(userId: string): Promise<SavedJobRow[]>;
  removeSaved(userId: string, jobId: string): Promise<void>;
  // resume↔job match scores (seeker-initiated matching)
  findResumeMatchByPair(resumeId: string, jobId: string): Promise<ResumeMatchScoreRow | null>;
  upsertResumeMatch(input: ResumeMatchScoreInsert): Promise<void>;
  // job-board distribution (syndication of job posts to external boards)
  listJobBoardSources(): Promise<JobBoardSourceRow[]>;
  findJobBoardPostingsForJob(jobId: string): Promise<JobBoardPostingRow[]>;
  insertJobBoardPosting(input: JobBoardPostingInsert): Promise<JobBoardPostingRow>;
  findJobBoardSyncLogs(sourceId: string, limit?: number): Promise<JobBoardSyncLogRow[]>;
  // exclusive (closed) boards + their bids
  listExclusiveBoards(): Promise<ExclusiveBoardRow[]>;
  findBidsForBoard(boardId: string): Promise<BoardBidRow[]>;
  insertBoardBid(input: BoardBidInsert): Promise<BoardBidRow>;
}

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

  async insertApplication(input: JobApplicationInsert): Promise<JobApplicationRow> {
    const [created] = await this.db.insert(jobApplications).values(input as any).returning();
    return created as JobApplicationRow;
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

  async findSavedForUser(userId: string): Promise<SavedJobRow[]> {
    return (await this.db.select().from(savedJobs).where(eq(savedJobs.userId, userId))) as SavedJobRow[];
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

  // ── job-board distribution ────────────────────────────────────────────────

  async listJobBoardSources(): Promise<JobBoardSourceRow[]> {
    return (await this.db.select().from(jobBoardSources)) as JobBoardSourceRow[];
  }

  async findJobBoardPostingsForJob(jobId: string): Promise<JobBoardPostingRow[]> {
    return (await this.db
      .select()
      .from(jobBoardPostings)
      .where(eq(jobBoardPostings.jobId, jobId))) as JobBoardPostingRow[];
  }

  async insertJobBoardPosting(input: JobBoardPostingInsert): Promise<JobBoardPostingRow> {
    const [row] = await this.db.insert(jobBoardPostings).values(input as any).returning();
    return row as JobBoardPostingRow;
  }

  async findJobBoardSyncLogs(sourceId: string, limit = 50): Promise<JobBoardSyncLogRow[]> {
    return (await this.db
      .select()
      .from(jobBoardSyncLog)
      .where(eq(jobBoardSyncLog.sourceId, sourceId))
      .orderBy(desc(jobBoardSyncLog.startedAt))
      .limit(Math.min(200, Math.max(1, limit)))) as JobBoardSyncLogRow[];
  }

  // ── exclusive boards + bids ───────────────────────────────────────────────

  async listExclusiveBoards(): Promise<ExclusiveBoardRow[]> {
    return (await this.db.select().from(exclusiveBoards)) as ExclusiveBoardRow[];
  }

  async findBidsForBoard(boardId: string): Promise<BoardBidRow[]> {
    return (await this.db
      .select()
      .from(boardBids)
      .where(eq(boardBids.boardId, boardId))) as BoardBidRow[];
  }

  async insertBoardBid(input: BoardBidInsert): Promise<BoardBidRow> {
    const [row] = await this.db.insert(boardBids).values(input as any).returning();
    return row as BoardBidRow;
  }

  // Keep `sql` import alive for future aggregate queries.
  private readonly _sqlPinned = sql;
}
