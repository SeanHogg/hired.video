/**
 * DashboardRepository — aggregate reads for `routes/dashboard.ts`.
 *
 * Every method pushes the reduction (COUNT / SUM / AVG / GROUP BY) into
 * SQL so the dashboard never pulls a user's full history of placements,
 * jobs, saved jobs or conversation memberships into the Worker just to
 * count them. The only row lists returned are explicitly capped.
 */

import { and, count, desc, eq, inArray, isNotNull, sql, type SQL, type SQLWrapper } from "drizzle-orm";
import { schema } from "../db/index.js";

export type DbLike = any;

const { conversationParticipants, placements, jobItems, jobApplications, savedJobs } = schema;

/** Cap on the per-placement time-to-hire list (aggregates cover all rows). */
const RECENT_PLACEMENTS_CAP = 200;

const DAY_SECONDS = 86_400;

export interface PlacementAggregate {
  total: number;
  paidCommission: number;
  /** Avg days createdAt → startDate over placements with a startDate; null when none. */
  avgDaysToHire: number | null;
}

export interface RecentPlacementRow {
  id: string;
  startDate: Date;
  createdAt: Date;
}

export interface EmployerJobAggregate {
  totalJobs: number;
  activeJobs: number;
  applicationsByStatus: Array<{ status: string; total: number }>;
  filledPositions: number;
  avgDaysToFill: number | null;
}

/** A half-open window [start, end). */
export interface TimeWindow {
  start: Date;
  end: Date;
}

export interface SavedJobAnalyticsWindows {
  thisWeek: TimeWindow;
  lastWeek: TimeWindow;
  /** Weekly trend buckets, oldest first. */
  weeks: TimeWindow[];
  /** Applied-before cutoff for the ghost-rate calculation. */
  ghostCutoff: Date;
  /** Earliest day considered for the activity streak. */
  streakSince: Date;
}

export interface SavedJobAnalyticsAggregate {
  /** count per lower(status). */
  funnel: Record<string, number>;
  totalTracked: number;
  totalApplied: number;
  thisWeekTracked: number;
  lastWeekTracked: number;
  thisWeekApplied: number;
  lastWeekApplied: number;
  weeks: Array<{ tracked: number; applied: number }>;
  appliedNoResponse: number;
  appliedBeforeGhostCutoff: number;
  /** Distinct UTC days (YYYY-MM-DD) with any tracked/applied/status-change activity since `streakSince`. */
  activeDays: Set<string>;
}

const ts = (d: Date) => sql`${d.toISOString()}::timestamptz`;
const num = (v: unknown) => Number(v ?? 0);

export class DashboardRepository {
  constructor(private readonly db: DbLike) {}

  async countConversationsForUser(userId: string): Promise<number> {
    const [row] = await this.db
      .select({ n: count() })
      .from(conversationParticipants)
      .where(eq(conversationParticipants.userId, userId));
    return num(row?.n);
  }

  async aggregatePlacementsForRecruiter(recruiterId: string): Promise<PlacementAggregate> {
    const [row] = await this.db
      .select({
        total: count(),
        paid: sql<string | null>`coalesce(sum(${placements.commissionAmount}) filter (where ${placements.commissionStatus} = 'paid'), 0)`,
        avgDays: sql<string | null>`avg(extract(epoch from (${placements.startDate} - ${placements.createdAt})) / ${DAY_SECONDS}) filter (where ${placements.startDate} is not null)`,
      })
      .from(placements)
      .where(eq(placements.recruiterId, recruiterId));
    return {
      total: num(row?.total),
      paidCommission: Number.parseFloat(String(row?.paid ?? 0)) || 0,
      avgDaysToHire: row?.avgDays == null ? null : Number(row.avgDays),
    };
  }

  /** Most recent placements that have a start date, capped. */
  async findRecentDatedPlacementsForRecruiter(recruiterId: string): Promise<RecentPlacementRow[]> {
    return (await this.db
      .select({ id: placements.id, startDate: placements.startDate, createdAt: placements.createdAt })
      .from(placements)
      .where(and(eq(placements.recruiterId, recruiterId), isNotNull(placements.startDate)))
      .orderBy(desc(placements.createdAt))
      .limit(RECENT_PLACEMENTS_CAP)) as RecentPlacementRow[];
  }

  async aggregateEmployerJobs(userId: string): Promise<EmployerJobAggregate> {
    const postedJobIds = this.db
      .select({ id: jobItems.id })
      .from(jobItems)
      .where(eq(jobItems.postedByUserId, userId));

    const [jobRows, applicationRows, placementRows] = await Promise.all([
      this.db
        .select({
          total: count(),
          active: sql<string>`count(*) filter (where ${jobItems.isActive})`,
        })
        .from(jobItems)
        .where(eq(jobItems.postedByUserId, userId)),
      this.db
        .select({ status: jobApplications.status, total: count() })
        .from(jobApplications)
        .where(inArray(jobApplications.jobId, postedJobIds))
        .groupBy(jobApplications.status),
      this.db
        .select({
          total: count(),
          avgDays: sql<string | null>`avg(extract(epoch from (${placements.startDate} - ${placements.createdAt})) / ${DAY_SECONDS}) filter (where ${placements.startDate} is not null)`,
        })
        .from(placements)
        .where(inArray(placements.jobId, postedJobIds)),
    ]);

    const [jobs] = jobRows as Array<{ total: unknown; active: unknown }>;
    const [placed] = placementRows as Array<{ total: unknown; avgDays: unknown }>;
    return {
      totalJobs: num(jobs?.total),
      activeJobs: num(jobs?.active),
      applicationsByStatus: (applicationRows as Array<{ status: string; total: unknown }>).map((r) => ({
        status: r.status,
        total: num(r.total),
      })),
      filledPositions: num(placed?.total),
      avgDaysToFill: placed?.avgDays == null ? null : Number(placed.avgDays),
    };
  }

  async aggregateSavedJobAnalytics(
    userId: string,
    w: SavedJobAnalyticsWindows,
  ): Promise<SavedJobAnalyticsAggregate> {
    // Tracker rows = the seeker's saved jobs, each carrying its newest
    // application's lifecycle (job_applications owns it, W3-D2); a saved job
    // with no application is "tracked".
    const latestApp = this.db
      .selectDistinctOn([jobApplications.jobId], {
        jobId: jobApplications.jobId,
        status: jobApplications.status,
        appliedAt: jobApplications.appliedAt,
        statusChangedAt: jobApplications.statusChangedAt,
      })
      .from(jobApplications)
      .where(eq(jobApplications.userId, userId))
      .orderBy(jobApplications.jobId, desc(jobApplications.appliedAt))
      .as("latest_app");
    const s = this.db
      .select({
        createdAt: savedJobs.createdAt,
        status: sql<string>`coalesce(${latestApp.status}, 'tracked')`.as("status"),
        appliedAt: sql<Date | null>`${latestApp.appliedAt}`.as("applied_at"),
        statusChangedAt: sql<Date | null>`${latestApp.statusChangedAt}`.as("status_changed_at"),
      })
      .from(savedJobs)
      .leftJoin(latestApp, eq(latestApp.jobId, savedJobs.jobId))
      .where(eq(savedJobs.userId, userId))
      .as("tracker");
    const inWindow = (col: SQLWrapper, win: TimeWindow) =>
      sql`${col} >= ${ts(win.start)} and ${col} < ${ts(win.end)}`;
    const countWhere = (cond: SQL): SQL<string> => sql<string>`count(*) filter (where ${cond})`;

    const weekCols: Record<string, SQL<string>> = {};
    w.weeks.forEach((win, i) => {
      weekCols[`t${i}`] = countWhere(inWindow(s.createdAt, win));
      weekCols[`a${i}`] = countWhere(inWindow(s.appliedAt, win));
    });

    const dayExpr = (col: SQLWrapper) =>
      sql<string>`to_char(${col} at time zone 'UTC', 'YYYY-MM-DD')`;
    const daysFor = (col: SQLWrapper) =>
      this.db
        .selectDistinct({ d: dayExpr(col) })
        .from(s)
        .where(sql`${col} >= ${ts(w.streakSince)}`);

    const [funnelRows, totalsRows, createdDays, appliedDays, changedDays] = await Promise.all([
      this.db
        .select({ status: sql<string>`lower(${s.status})`, n: count() })
        .from(s)
        .groupBy(sql`lower(${s.status})`),
      this.db
        .select({
          total: count(),
          applied: countWhere(sql`${s.status} not in ('tracked', 'cancelled')`),
          thisWeekTracked: countWhere(inWindow(s.createdAt, w.thisWeek)),
          lastWeekTracked: countWhere(inWindow(s.createdAt, w.lastWeek)),
          thisWeekApplied: countWhere(sql`${s.status} <> 'tracked' and ${inWindow(s.appliedAt, w.thisWeek)}`),
          lastWeekApplied: countWhere(sql`${s.status} <> 'tracked' and ${inWindow(s.appliedAt, w.lastWeek)}`),
          appliedNoResponse: countWhere(sql`${s.status} = 'applied' and ${s.appliedAt} < ${ts(w.ghostCutoff)}`),
          appliedBeforeGhostCutoff: countWhere(sql`${s.appliedAt} < ${ts(w.ghostCutoff)}`),
          ...weekCols,
        })
        .from(s),
      daysFor(s.createdAt),
      daysFor(s.appliedAt),
      daysFor(s.statusChangedAt),
    ]);

    const funnel: Record<string, number> = {};
    for (const r of funnelRows as Array<{ status: string; n: unknown }>) funnel[r.status] = num(r.n);

    const t = ((totalsRows as Array<Record<string, unknown>>)[0] ?? {}) as Record<string, unknown>;
    const activeDays = new Set<string>();
    for (const rows of [createdDays, appliedDays, changedDays] as Array<Array<{ d: string | null }>>) {
      for (const r of rows) if (r.d) activeDays.add(r.d);
    }

    return {
      funnel,
      totalTracked: num(t.total),
      totalApplied: num(t.applied),
      thisWeekTracked: num(t.thisWeekTracked),
      lastWeekTracked: num(t.lastWeekTracked),
      thisWeekApplied: num(t.thisWeekApplied),
      lastWeekApplied: num(t.lastWeekApplied),
      weeks: w.weeks.map((_, i) => ({ tracked: num(t[`t${i}`]), applied: num(t[`a${i}`]) })),
      appliedNoResponse: num(t.appliedNoResponse),
      appliedBeforeGhostCutoff: num(t.appliedBeforeGhostCutoff),
      activeDays,
    };
  }
}
