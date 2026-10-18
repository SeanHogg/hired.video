/**
 * JobBoardSourcesRepository — the job-board scraper source aggregate (#86):
 * `job_board_sources` (global admin sources + per-user custom sources) and
 * its child `job_board_sync_log` (one row per scrape run).
 *
 * Owner-scoped writes take an optional `ownerId`; when given, the statement
 * also matches `created_by_user_id` so a user can only touch their own rows
 * (single statement, no read-then-write).
 */
import { and, count, desc, eq } from "drizzle-orm";
import { schema } from "../db/index.js";

const { jobBoardSources, jobBoardSyncLog } = schema;

export type DbLike = any;

export type JobBoardSourceRow = typeof jobBoardSources.$inferSelect;
export type JobBoardSourceInsert = typeof jobBoardSources.$inferInsert;
export type JobBoardSourcePatch = Partial<JobBoardSourceInsert>;
export type JobBoardSyncLogRow = typeof jobBoardSyncLog.$inferSelect;

export interface IJobBoardSourcesRepository {
  listAll(): Promise<JobBoardSourceRow[]>;
  listByCreator(userId: string): Promise<JobBoardSourceRow[]>;
  countByCreator(userId: string): Promise<number>;
  findById(id: string): Promise<JobBoardSourceRow | null>;
  insert(input: JobBoardSourceInsert): Promise<JobBoardSourceRow>;
  update(id: string, patch: JobBoardSourcePatch, ownerId?: string): Promise<JobBoardSourceRow | null>;
  delete(id: string, ownerId?: string): Promise<void>;
  listSyncLogs(sourceId: string, limit?: number): Promise<JobBoardSyncLogRow[]>;
}

export class JobBoardSourcesRepository implements IJobBoardSourcesRepository {
  constructor(private readonly db: DbLike) {}

  private match(id: string, ownerId?: string) {
    return ownerId
      ? and(eq(jobBoardSources.id, id), eq(jobBoardSources.createdByUserId, ownerId))
      : eq(jobBoardSources.id, id);
  }

  async listAll(): Promise<JobBoardSourceRow[]> {
    return (await this.db
      .select()
      .from(jobBoardSources)
      .orderBy(desc(jobBoardSources.createdAt))) as JobBoardSourceRow[];
  }

  async listByCreator(userId: string): Promise<JobBoardSourceRow[]> {
    return (await this.db
      .select()
      .from(jobBoardSources)
      .where(eq(jobBoardSources.createdByUserId, userId))
      .orderBy(desc(jobBoardSources.createdAt))) as JobBoardSourceRow[];
  }

  async countByCreator(userId: string): Promise<number> {
    const [row] = await this.db
      .select({ n: count() })
      .from(jobBoardSources)
      .where(eq(jobBoardSources.createdByUserId, userId));
    return Number(row?.n ?? 0);
  }

  async findById(id: string): Promise<JobBoardSourceRow | null> {
    const [row] = await this.db.select().from(jobBoardSources).where(eq(jobBoardSources.id, id)).limit(1);
    return (row as JobBoardSourceRow) ?? null;
  }

  async insert(input: JobBoardSourceInsert): Promise<JobBoardSourceRow> {
    const [row] = await this.db.insert(jobBoardSources).values(input).returning();
    return row as JobBoardSourceRow;
  }

  async update(id: string, patch: JobBoardSourcePatch, ownerId?: string): Promise<JobBoardSourceRow | null> {
    const [row] = await this.db.update(jobBoardSources).set(patch).where(this.match(id, ownerId)).returning();
    return (row as JobBoardSourceRow) ?? null;
  }

  async delete(id: string, ownerId?: string): Promise<void> {
    await this.db.delete(jobBoardSources).where(this.match(id, ownerId));
  }

  async listSyncLogs(sourceId: string, limit = 50): Promise<JobBoardSyncLogRow[]> {
    return (await this.db
      .select()
      .from(jobBoardSyncLog)
      .where(eq(jobBoardSyncLog.sourceId, sourceId))
      .orderBy(desc(jobBoardSyncLog.startedAt))
      .limit(Math.min(200, Math.max(1, limit)))) as JobBoardSyncLogRow[];
  }
}
