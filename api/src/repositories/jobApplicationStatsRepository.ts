/**
 * JobApplicationStatsRepository — seeker-scoped read aggregates over the ONE
 * application owner, `job_applications` (the tracker lifecycle writes live in
 * jobApplicationTrackerRepository.ts). Feeds the seeker dashboard, career
 * progress and the AI insight / copilot prompts.
 */
import { and, count, eq, gte } from "drizzle-orm";
import { schema, type Db } from "../db/index.js";

const { jobApplications } = schema;

export interface StatusCount {
  status: string;
  total: number;
}

export interface DatedApplicationStatus {
  status: string;
  appliedAt: Date;
}

export class JobApplicationStatsRepository {
  constructor(private readonly db: Db) {}

  /** The user's applications grouped by status (all time). */
  async countByStatus(userId: string): Promise<StatusCount[]> {
    const rows = await this.db
      .select({ status: jobApplications.status, total: count() })
      .from(jobApplications)
      .where(eq(jobApplications.userId, userId))
      .groupBy(jobApplications.status);
    return rows.map((r) => ({ status: r.status, total: Number(r.total) }));
  }

  /** Status + appliedAt of every application applied on/after `since`, oldest first. */
  async listAppliedSince(userId: string, since: Date): Promise<DatedApplicationStatus[]> {
    return this.db
      .select({ status: jobApplications.status, appliedAt: jobApplications.appliedAt })
      .from(jobApplications)
      .where(and(eq(jobApplications.userId, userId), gte(jobApplications.appliedAt, since)))
      .orderBy(jobApplications.appliedAt);
  }

  /** Count of the user's applications, optionally narrowed by status and/or creation date. */
  async countForUser(userId: string, opts: { status?: string; createdSince?: Date } = {}): Promise<number> {
    const conds = [eq(jobApplications.userId, userId)];
    if (opts.status !== undefined) conds.push(eq(jobApplications.status, opts.status));
    if (opts.createdSince !== undefined) conds.push(gte(jobApplications.createdAt, opts.createdSince));
    const [row] = await this.db
      .select({ n: count() })
      .from(jobApplications)
      .where(and(...conds));
    return Number(row?.n ?? 0);
  }
}
