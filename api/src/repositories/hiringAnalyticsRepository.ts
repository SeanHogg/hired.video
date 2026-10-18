/**
 * HiringAnalyticsRepository — read-only rows behind
 * `GET /api/analytics/hiring?metric=` (time-to-hire, conversion funnel,
 * org-level insights) and `GET /api/services/team/leaderboard`. Aggregation
 * math lives in services/analytics/{hiringAnalytics,teamLeaderboard}.ts;
 * this file only fetches.
 */
import { and, eq, gte, inArray, lt } from "drizzle-orm";
import { schema } from "../db/index.js";

export type DbLike = any;

export interface PlacementRow {
  id?: string;
  jobId: string | null;
  jobTitle: string | null;
  createdAt: Date | string;
  startDate?: Date | string | null;
}

export interface ApplicationRow {
  id: string;
  jobId: string | null;
  status: string | null;
  appliedAt: Date | string | null;
  jobTitle: string | null;
}

export interface PipelineEntryRow {
  stage: string;
  addedFrom: string | null;
  createdAt: Date | string | null;
  stageChangedAt: Date | string | null;
}

export interface TeamMemberRow {
  userId: string;
  role: string;
  name: string | null;
  email: string | null;
}

export interface PipelineOwnershipRow {
  ownerId: string | null;
  stage: string;
  stageChangedAt: Date | string;
}

export interface TouchpointRow {
  performedByUserId: string | null;
  type: string;
  createdAt: Date | string;
}

export class HiringAnalyticsRepository {
  constructor(private readonly db: DbLike) {}

  /** Placements made by a recruiter within [from, to). */
  async placementsForRecruiter(recruiterId: string, from: Date, to: Date): Promise<PlacementRow[]> {
    const p = schema.placements;
    return (await this.db
      .select({
        id: p.id,
        jobId: p.jobId,
        jobTitle: p.jobTitle,
        createdAt: p.createdAt,
        startDate: p.startDate,
      })
      .from(p)
      .where(and(eq(p.recruiterId, recruiterId), gte(p.createdAt, from), lt(p.createdAt, to)))) as PlacementRow[];
  }

  /** Applications to jobs the user posted, applied within [from, to). */
  async applicationsForPoster(userId: string, from: Date, to: Date): Promise<ApplicationRow[]> {
    const a = schema.jobApplications;
    return (await this.db
      .select({
        id: a.id,
        jobId: a.jobId,
        status: a.status,
        appliedAt: a.appliedAt,
        jobTitle: schema.jobItems.title,
      })
      .from(a)
      .leftJoin(schema.jobItems, eq(a.jobId, schema.jobItems.id))
      .where(and(
        eq((schema.jobItems as any).postedByUserId, userId),
        gte(a.appliedAt, from),
        lt(a.appliedAt, to),
      ))) as ApplicationRow[];
  }

  /** Ids of every job the user posted (org scope for insights). */
  async jobIdsPostedBy(userId: string): Promise<string[]> {
    const jobs = (schema as any).jobItems;
    if (!jobs) return [];
    const rows = await this.db
      .select({ id: jobs.id })
      .from(jobs)
      .where(eq(jobs.postedByUserId, userId))
      .catch(() => []);
    return (rows as Array<{ id: string }>).map((r) => r.id);
  }

  /** Pipeline entries across the given jobs. Empty when the table is absent. */
  async pipelineEntriesForJobs(jobIds: string[]): Promise<PipelineEntryRow[]> {
    const pipeline = (schema as any).jobPipelineEntries;
    if (!pipeline || jobIds.length === 0) return [];
    return (await this.db
      .select({
        stage: pipeline.stage,
        addedFrom: pipeline.addedFrom,
        createdAt: pipeline.createdAt,
        stageChangedAt: pipeline.stageChangedAt,
      })
      .from(pipeline)
      .where(inArray(pipeline.jobId, jobIds))
      .catch(() => [])) as PipelineEntryRow[];
  }

  /** Active members of a company (owner included) with identity. */
  async activeCompanyMembers(companyId: string): Promise<TeamMemberRow[]> {
    const m = schema.userCompanyRoleAssociations;
    return (await this.db
      .select({ userId: m.userId, role: m.role, name: schema.users.name, email: schema.users.email })
      .from(m)
      .innerJoin(schema.users, eq(schema.users.id, m.userId))
      .where(and(eq(m.companyId, companyId), eq(m.isActive, true)))) as TeamMemberRow[];
  }

  /** Pipeline ownership rows on every job posted by any of `posterIds`. */
  async pipelineOwnershipForPosters(posterIds: string[]): Promise<PipelineOwnershipRow[]> {
    if (posterIds.length === 0) return [];
    const pe = schema.jobPipelineEntries;
    return (await this.db
      .select({ ownerId: pe.ownerId, stage: pe.stage, stageChangedAt: pe.stageChangedAt })
      .from(pe)
      .innerJoin(schema.jobItems, eq(schema.jobItems.id, pe.jobId))
      .where(inArray(schema.jobItems.postedByUserId, posterIds))) as PipelineOwnershipRow[];
  }

  /** Touchpoints performed by any of `performerIds` since `since`. */
  async touchpointsSince(performerIds: string[], since: Date): Promise<TouchpointRow[]> {
    if (performerIds.length === 0) return [];
    const tp = schema.pipelineTouchpoints;
    return (await this.db
      .select({ performedByUserId: tp.performedByUserId, type: tp.type, createdAt: tp.createdAt })
      .from(tp)
      .where(and(gte(tp.createdAt, since), inArray(tp.performedByUserId, performerIds)))) as TouchpointRow[];
  }
}
