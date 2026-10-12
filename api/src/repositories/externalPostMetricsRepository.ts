/**
 * external_post_metrics persistence (migration 0525, #2048): which
 * publications are due a metrics read, the daily-snapshot upsert, the
 * webhook's "which publication is this post?" lookup, and a project's
 * latest snapshot per publication.
 */
import { and, desc, eq, gte, inArray, isNotNull, sql } from "drizzle-orm";
import { getDb, type Db } from "../db/index.js";
import { externalPostMetrics, socialPublishJobs } from "../db/schema/distribution.js";
import { studioProjectPublications } from "../db/schema/studioPublications.js";
import { studioProjects } from "../db/schema/resumes.js";
import type { PostMetricCounts } from "../../../shared/social-publish-jobs.js";

/** A live post on a network, with the user whose connected account posted
 *  it (the stats read uses that account's token). */
export interface SyncablePublication {
  id: string;
  projectId: string;
  posterUserId: string;
  destination: string;
  externalId: string;
}

/** Posts older than this are no longer synced (their counts have settled). */
export const METRICS_SYNC_WINDOW_DAYS = 90;

/**
 * Who posted it: the recorded poster (published_by, migration 0526); for a
 * row from before that, the creator of the scheduled job that produced it;
 * only when neither is known, the project owner.
 */
export const posterUserIdSql = sql<string>`coalesce(
  ${studioProjectPublications.publishedBy},
  (SELECT j.created_by FROM ${socialPublishJobs} j WHERE j.publication_id = ${studioProjectPublications.id}
    ORDER BY j.completed_at DESC NULLS LAST LIMIT 1),
  ${studioProjects.userId}
)`;

const syncColumns = {
  id: studioProjectPublications.id,
  projectId: studioProjectPublications.projectId,
  posterUserId: posterUserIdSql,
  destination: studioProjectPublications.destination,
  externalId: sql<string>`${studioProjectPublications.externalId}`,
};

/** UTC calendar day of `d` as YYYY-MM-DD (the snapshot key). */
export function metricDateOf(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * Up to `limit` published network posts (from the last 90 days) with no
 * snapshot for today yet, newest first — the cron's bounded batch. One
 * query (anti-join on the (publication, day) unique index).
 */
export async function listDueForSync(
  args: { destinations: readonly string[]; now: Date; limit: number },
  db: Db = getDb(),
): Promise<SyncablePublication[]> {
  const since = new Date(args.now.getTime() - METRICS_SYNC_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  const today = metricDateOf(args.now);
  return db
    .select(syncColumns)
    .from(studioProjectPublications)
    .innerJoin(studioProjects, eq(studioProjects.id, studioProjectPublications.projectId))
    .where(
      and(
        eq(studioProjectPublications.status, "published"),
        isNotNull(studioProjectPublications.externalId),
        inArray(studioProjectPublications.destination, [...args.destinations]),
        gte(studioProjectPublications.publishedAt, since),
        sql`NOT EXISTS (SELECT 1 FROM ${externalPostMetrics} m WHERE m.publication_id = ${studioProjectPublications.id} AND m.metric_date = ${today}::date)`,
      ),
    )
    .orderBy(desc(studioProjectPublications.publishedAt))
    .limit(args.limit);
}

/** The publications a webhook names, by the network's post ids. */
export async function findByExternalIds(
  args: { destination: string; externalIds: readonly string[] },
  db: Db = getDb(),
): Promise<SyncablePublication[]> {
  if (args.externalIds.length === 0) return [];
  return db
    .select(syncColumns)
    .from(studioProjectPublications)
    .innerJoin(studioProjects, eq(studioProjects.id, studioProjectPublications.projectId))
    .where(
      and(
        eq(studioProjectPublications.destination, args.destination),
        inArray(studioProjectPublications.externalId, [...args.externalIds]),
      ),
    );
}

/** Write today's snapshot for each publication — ONE multi-row upsert. */
export async function upsertSnapshots(
  rows: ReadonlyArray<{ publicationId: string; counts: PostMetricCounts }>,
  now: Date,
  db: Db = getDb(),
): Promise<void> {
  if (rows.length === 0) return;
  const metricDate = metricDateOf(now);
  await db
    .insert(externalPostMetrics)
    .values(rows.map((r) => ({ publicationId: r.publicationId, metricDate, ...r.counts, fetchedAt: now })))
    .onConflictDoUpdate({
      target: [externalPostMetrics.publicationId, externalPostMetrics.metricDate],
      set: {
        views: sql`excluded.views`,
        likes: sql`excluded.likes`,
        shares: sql`excluded.shares`,
        comments: sql`excluded.comments`,
        fetchedAt: sql`excluded.fetched_at`,
      },
    });
}

/** One publication's latest snapshot, for a project's off-platform panel. */
export interface PublicationMetricsRow extends PostMetricCounts {
  publicationId: string;
  destination: string;
  externalUrl: string | null;
  fetchedAt: Date | null;
}

/** Every publication of the project with its newest snapshot (null counts
 *  when never read). ONE query: DISTINCT ON picks the newest day per post. */
export async function latestForProject(projectId: string, db: Db = getDb()): Promise<PublicationMetricsRow[]> {
  const result = await db.execute(sql`
    SELECT DISTINCT ON (p.id)
      p.id AS "publicationId", p.destination, p.external_url AS "externalUrl",
      m.views, m.likes, m.shares, m.comments, m.fetched_at AS "fetchedAt"
    FROM ${studioProjectPublications} p
    LEFT JOIN ${externalPostMetrics} m ON m.publication_id = p.id
    WHERE p.project_id = ${projectId} AND p.status = 'published' AND p.external_id IS NOT NULL
    ORDER BY p.id, m.metric_date DESC NULLS LAST
  `);
  const rows = (Array.isArray(result) ? result : (result as { rows?: unknown[] }).rows ?? []) as Array<
    Record<string, unknown>
  >;
  return rows.map((r) => ({
    publicationId: String(r.publicationId),
    destination: String(r.destination),
    externalUrl: (r.externalUrl as string | null) ?? null,
    views: toCount(r.views),
    likes: toCount(r.likes),
    shares: toCount(r.shares),
    comments: toCount(r.comments),
    fetchedAt: r.fetchedAt ? new Date(String(r.fetchedAt)) : null,
  }));
}

/** bigint arrives as a string from the HTTP driver. */
function toCount(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
