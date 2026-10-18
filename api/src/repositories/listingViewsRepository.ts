/**
 * ListingViewsRepository — job + company per-view events (#863) and the
 * per-job analytics rollup (#411).
 *
 *   insertJobView / insertCompanyView  — write side of the `job_view` /
 *     `company_view` analytics event kinds: artifact_views rows with
 *     event_type 'listing_view' (job_view_events / company_view_events were
 *     folded in by W3-A 0580; the stream is retention-swept at 180 days).
 *   aggregateJobViews / aggregateCompanyViews — 30-day traffic aggregate
 *     (totals, unique viewers, country / referrer / source / day splits).
 *   jobRollup — views-by-day with sponsored split, applications-by-source
 *     and pipeline funnel. Each subquery is guarded so a missing table on a
 *     given deploy yields a partial result instead of a 500.
 */
import { and, desc, eq, gte, sql, type SQL } from "drizzle-orm";
import { schema } from "../db/index.js";

const { artifactViews } = schema;
export type ListingKind = "job" | "company";

export type DbLike = any;

const WINDOW_MS = 30 * 86_400_000;

export interface ViewEventInsert {
  viewerUserId: string | null;
  countryCode: string | null;
  region: string | null;
  referrer: string | null;
  source: string;
  userAgent: string | null;
}

export interface ListingViewMetrics {
  entityId: string;
  totalViews: number;
  uniqueViewers: number;
  byCountry: Array<{ country: string; count: number }>;
  byReferrer: Array<{ referrer: string; count: number }>;
  bySource: Array<{ source: string; count: number }>;
  byDay: Array<{ day: string; count: number }>;
}

export interface JobAnalyticsRollup {
  jobId: string;
  totalViews: number;
  sponsoredViews: number;
  organicViews: number;
  totalApplications: number;
  viewsByDay: Array<{ day: string; count: number }>;
  applicationsBySource: Array<{ source: string; count: number }>;
  pipelineFunnel: Array<{ stage: string; count: number }>;
}

const toCount = (v: unknown) => Number(v) || 0;

/** The artifact_views row for one listing view (pure — the batched beacon
 *  ingest folds these into its single artifact_views INSERT). */
export function listingViewRow(
  kind: ListingKind,
  entityId: string,
  input: ViewEventInsert,
): typeof artifactViews.$inferInsert {
  return {
    artifactKind: kind,
    artifactId: entityId,
    eventType: "listing_view",
    viewerId: input.viewerUserId,
    ipCountry: input.countryCode,
    region: input.region,
    referrer: input.referrer,
    source: input.source,
    userAgent: input.userAgent,
    engagementUnit: "%",
  };
}

export class ListingViewsRepository {
  constructor(private readonly db: DbLike, private readonly now: () => Date = () => new Date()) {}

  insertJobView(jobId: string, input: ViewEventInsert): Promise<void> {
    return this.insertListingView("job", jobId, input);
  }

  insertCompanyView(companyId: string, input: ViewEventInsert): Promise<void> {
    return this.insertListingView("company", companyId, input);
  }

  aggregateJobViews(jobId: string): Promise<ListingViewMetrics> {
    return this.aggregate("job", jobId);
  }

  aggregateCompanyViews(companyId: string): Promise<ListingViewMetrics> {
    return this.aggregate("company", companyId);
  }

  private async insertListingView(kind: ListingKind, entityId: string, input: ViewEventInsert): Promise<void> {
    await this.db.insert(artifactViews).values(listingViewRow(kind, entityId, input));
  }

  /** One listing's `listing_view` rows inside the 30-day window. */
  private listingWindow(kind: ListingKind, entityId: string, since: Date): SQL | undefined {
    return and(
      eq(artifactViews.artifactKind, kind),
      eq(artifactViews.artifactId, entityId),
      eq(artifactViews.eventType, "listing_view"),
      gte(artifactViews.viewedAt, since),
    );
  }

  private async aggregate(kind: ListingKind, entityId: string): Promise<ListingViewMetrics> {
    const since = new Date(this.now().getTime() - WINDOW_MS);
    const table = artifactViews;
    const where = this.listingWindow(kind, entityId, since);
    const country = sql<string>`coalesce(${table.ipCountry}, 'unknown')`;
    const referrer = sql<string>`coalesce(${table.referrer}, 'direct')`;
    const source = sql<string>`coalesce(${table.source}, 'organic')`;
    const day = sql<string>`to_char(${table.viewedAt}, 'YYYY-MM-DD')`;
    const cnt = sql<number>`count(*)::int`;

    const [[totalsRow], byCountry, byReferrer, bySource, byDay] = await Promise.all([
      this.db
        .select({ total: cnt, unique: sql<number>`count(distinct ${table.viewerId})::int` })
        .from(table)
        .where(where),
      this.db.select({ country, count: cnt }).from(table).where(where)
        .groupBy(country).orderBy(desc(sql`count(*)`)).limit(20),
      this.db.select({ referrer, count: cnt }).from(table).where(where)
        .groupBy(referrer).orderBy(desc(sql`count(*)`)).limit(20),
      this.db.select({ source, count: cnt }).from(table).where(where).groupBy(source),
      this.db.select({ day, count: cnt }).from(table).where(where).groupBy(day).orderBy(day),
    ]);

    return {
      entityId,
      totalViews: toCount(totalsRow?.total),
      uniqueViewers: toCount(totalsRow?.unique),
      byCountry: byCountry.map((r: any) => ({ country: r.country, count: toCount(r.count) })),
      byReferrer: byReferrer.map((r: any) => ({ referrer: r.referrer, count: toCount(r.count) })),
      bySource: bySource.map((r: any) => ({ source: r.source, count: toCount(r.count) })),
      byDay: byDay.map((r: any) => ({ day: r.day, count: toCount(r.count) })),
    };
  }

  async jobRollup(jobId: string): Promise<JobAnalyticsRollup> {
    const since = new Date(this.now().getTime() - WINDOW_MS);
    const s = schema as any;

    let viewsByDay: JobAnalyticsRollup["viewsByDay"] = [];
    let sponsoredViews = 0;
    try {
      const day = sql<string>`to_char(${artifactViews.viewedAt}, 'YYYY-MM-DD')`;
      const rows = await this.db
        .select({
          day,
          count: sql<number>`count(*)::int`,
          sponsored: sql<number>`sum(case when ${artifactViews.source} = 'boost' then 1 else 0 end)::int`,
        })
        .from(artifactViews)
        .where(this.listingWindow("job", jobId, since))
        .groupBy(day)
        .orderBy(day);
      viewsByDay = rows.map((r: any) => ({ day: r.day, count: toCount(r.count) }));
      sponsoredViews = rows.reduce((acc: number, r: any) => acc + toCount(r.sponsored), 0);
    } catch {
      // query failed — leave the series empty
    }
    const totalViews = viewsByDay.reduce((acc, r) => acc + r.count, 0);

    let applicationsBySource: JobAnalyticsRollup["applicationsBySource"] = [];
    try {
      const appsTable = s.jobApplications;
      if (appsTable) {
        const src = sql<string>`coalesce(${appsTable.source}, 'direct')`;
        const rows = await this.db
          .select({ source: src, count: sql<number>`count(*)::int` })
          .from(appsTable)
          .where(eq(appsTable.jobId, jobId))
          .groupBy(src);
        applicationsBySource = rows.map((r: any) => ({ source: r.source, count: toCount(r.count) }));
      }
    } catch {
      // table missing
    }

    let pipelineFunnel: JobAnalyticsRollup["pipelineFunnel"] = [];
    try {
      const pipelineTable = s.jobPipelineApplications ?? s.hiringPipelineApplications;
      if (pipelineTable) {
        const rows = await this.db
          .select({ stage: pipelineTable.stage, count: sql<number>`count(*)::int` })
          .from(pipelineTable)
          .where(eq(pipelineTable.jobId, jobId))
          .groupBy(pipelineTable.stage);
        pipelineFunnel = rows.map((r: any) => ({ stage: r.stage ?? "unknown", count: toCount(r.count) }));
      }
    } catch {
      // table missing
    }

    return {
      jobId,
      totalViews,
      sponsoredViews,
      organicViews: totalViews - sponsoredViews,
      totalApplications: applicationsBySource.reduce((acc, r) => acc + r.count, 0),
      viewsByDay,
      applicationsBySource,
      pipelineFunnel,
    };
  }
}
