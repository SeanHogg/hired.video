/**
 * artifactAnalytics.ts — kind-aware analytics rollup over the polymorphic
 * artifact_views table. Backs `GET /api/analytics/artifacts/:kind/:id`.
 *
 * Shape parity with the legacy `studio-features.ts /analytics/projects/:id`
 * builder so the frontend <MetricsPanel> renders identically regardless
 * of which artifact kind it's pointed at. The aggregation math
 * (bucket sum + viewer dedup + referrer hostname collapse + country
 * histogram) is artifact-kind-agnostic — only `engagementUnit` and the
 * unit-of-the-axis label differ.
 *
 * See Gap Register #1019 L3.
 */

import { and, count, desc, eq, gte, inArray, sql } from "drizzle-orm";
import { getDb, schema } from "../../db/index.js";
import {
  isStudioArtifactKind,
  type ArtifactKind,
} from "../../../../shared/artifact-views.js";
import { ROLLUP_EVENTS, rollupArtifactEvents, type ArtifactEventRollup } from "./artifactEventRollup.js";
import { getOrSetCached } from "../../utils/edge-cache.js";

/** Owner-lookup table keyed on artifact kind. One join per kind; the
 *  beacon + analytics endpoints both call this to stamp owner_user_id
 *  on inserts and gate aggregate reads. */
export async function lookupArtifactOwner(
  kind: ArtifactKind,
  artifactId: string,
): Promise<string | null> {
  const db = getDb();
  // Every studio MediaKind keys on studio_projects.id — collapse the
  // per-kind cases into one branch per the DRY rule. `isStudioArtifactKind`
  // is the SSoT for "is this row in studio_projects?"; adding a new
  // studio kind to ARTIFACT_KINDS auto-routes through this branch.
  if (isStudioArtifactKind(kind)) {
    const [r] = await db
      .select({ userId: schema.studioProjects.userId })
      .from(schema.studioProjects)
      .where(eq(schema.studioProjects.id, artifactId))
      .limit(1);
    return r?.userId ?? null;
  }
  switch (kind) {
    case "resume": {
      const [r] = await db
        .select({ userId: schema.resumeInformation.userId })
        .from(schema.resumeInformation)
        .where(eq(schema.resumeInformation.id, artifactId))
        .limit(1);
      return r?.userId ?? null;
    }
    case "company": {
      const [r] = await db
        .select({ userId: schema.companyProfiles.ownerId })
        .from(schema.companyProfiles)
        .where(eq(schema.companyProfiles.id, artifactId))
        .limit(1);
      return r?.userId ?? null;
    }
    case "profile": {
      // Profile artifact_id IS the owning user id (users.id).
      const [r] = await db
        .select({ id: schema.users.id })
        .from(schema.users)
        .where(eq(schema.users.id, artifactId))
        .limit(1);
      return r?.id ?? null;
    }
    case "article": {
      // articles may not exist in this PR's schema build yet — fall back
      // to a select against the polymorphic owner stamp written by the
      // first view event; ok to return null if no rows yet.
      const [r] = await db
        .select({ ownerUserId: schema.artifactViews.ownerUserId })
        .from(schema.artifactViews)
        .where(
          and(
            eq(schema.artifactViews.artifactKind, "article"),
            eq(schema.artifactViews.artifactId, artifactId),
          ),
        )
        .limit(1);
      return r?.ownerUserId ?? null;
    }
    case "job": {
      const [r] = await db
        .select({ userId: schema.jobItems.postedByUserId })
        .from(schema.jobItems)
        .where(eq(schema.jobItems.id, artifactId))
        .limit(1);
      return r?.userId ?? null;
    }
    case "post": {
      const [r] = await db
        .select({ userId: schema.feedPosts.userId })
        .from(schema.feedPosts)
        .where(eq(schema.feedPosts.id, artifactId))
        .limit(1);
      return r?.userId ?? null;
    }
    case "studio_template":
    case "service": {
      // Same fallback as 'article' — read the owner stamp off the first
      // recorded view if the corresponding entity table isn't reachable
      // from here. Safe because the beacon endpoint stamps the owner
      // at insert from this same function.
      const [r] = await db
        .select({ ownerUserId: schema.artifactViews.ownerUserId })
        .from(schema.artifactViews)
        .where(
          and(
            eq(schema.artifactViews.artifactKind, kind),
            eq(schema.artifactViews.artifactId, artifactId),
          ),
        )
        .limit(1);
      return r?.ownerUserId ?? null;
    }
    default:
      return null;
  }
}

export interface ArtifactMetricsDTO {
  totalViews: number;
  ctaClicks?: number;
  /** CTA clicks ÷ in-platform views. */
  ctaClickThroughRate?: number;
  /** Paid-media impressions (video_analytics event = "impression"). Reads
   *  0 until impression ingestion exists (#1139 / #1137). */
  impressionCount?: number;
  /** CTA clicks ÷ impressions; 0 when there are no impressions. */
  impressionCtr?: number;
  avgWatchSec?: number;
  avgPercentWatched?: number;
  heatmap?: number[];
  topDropOffSecond?: number | null;
  heatmapUnit?: "s" | "%";
  viewers?: Array<{
    id: string;
    email?: string;
    company?: string;
    lastViewed: string;
    views: number;
    avgPercent?: number;
  }>;
  referrers?: Array<{ source: string; views: number }>;
  countries?: Array<{ country: string; views: number }>;
  /** Views per UTC day over the last VIEWS_OVER_TIME_DAYS days, oldest
   *  first, zero-filled (#861). */
  viewsOverTime?: Array<{ date: string; views: number }>;
}

/** Window of the views-over-time series. */
export const VIEWS_OVER_TIME_DAYS = 30;
const DAY_MS = 86_400_000;

/** Zero-filled daily series ending today (UTC), oldest first. Pure. */
export function fillDailySeries(
  rows: Array<{ day: string; views: number }>,
  now: Date,
  days: number = VIEWS_OVER_TIME_DAYS,
): Array<{ date: string; views: number }> {
  const byDay = new Map(rows.map((r) => [r.day.slice(0, 10), Number(r.views) || 0]));
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const out: Array<{ date: string; views: number }> = [];
  for (let i = days - 1; i >= 0; i--) {
    const date = new Date(today - i * DAY_MS).toISOString().slice(0, 10);
    out.push({ date, views: byDay.get(date) ?? 0 });
  }
  return out;
}

const EMPTY_METRICS: ArtifactMetricsDTO = {
  totalViews: 0,
  heatmapUnit: "s",
  heatmap: [],
  viewers: [],
  referrers: [],
  countries: [],
  topDropOffSecond: null,
};

/** Build an ArtifactMetricsDTO for a single artifact by aggregating
 *  artifact_views rows. Returns EMPTY_METRICS when no views exist. */
export async function buildArtifactMetrics(
  kind: ArtifactKind,
  artifactId: string,
): Promise<ArtifactMetricsDTO> {
  const db = getDb();
  const now = new Date();
  const seriesSince = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) - (VIEWS_OVER_TIME_DAYS - 1) * DAY_MS,
  );
  const day = sql<string>`to_char(date_trunc('day', ${schema.artifactViews.viewedAt} AT TIME ZONE 'UTC'), 'YYYY-MM-DD')`;
  // CTA + impression counts live on the videoAnalytics event-counts table
  // (FK = studio_project_id, kind-agnostic — see migration 0085). Every
  // studio MediaKind can carry CTA widgets, so read them for every studio
  // kind via the SSoT predicate. ONE grouped query covers both events and
  // runs alongside the views read, not after it.
  const [views, eventRows, dailyRows] = await Promise.all([
    db
      .select()
      .from(schema.artifactViews)
      .where(
        and(
          eq(schema.artifactViews.artifactKind, kind),
          eq(schema.artifactViews.artifactId, artifactId),
        ),
      )
      .orderBy(desc(schema.artifactViews.viewedAt))
      .limit(2000),
    isStudioArtifactKind(kind)
      ? db
          .select({ event: schema.videoAnalytics.event, n: count() })
          .from(schema.videoAnalytics)
          .where(
            and(
              eq(schema.videoAnalytics.studioProjectId, artifactId),
              inArray(schema.videoAnalytics.event, [...ROLLUP_EVENTS]),
            ),
          )
          .groupBy(schema.videoAnalytics.event)
      : Promise.resolve(null),
    // Views over time — counted in SQL so the series isn't capped by the
    // 2000-row detail read above.
    db
      .select({ day, views: count() })
      .from(schema.artifactViews)
      .where(
        and(
          eq(schema.artifactViews.artifactKind, kind),
          eq(schema.artifactViews.artifactId, artifactId),
          gte(schema.artifactViews.viewedAt, seriesSince),
        ),
      )
      .groupBy(day),
  ]);
  const viewsOverTime = fillDailySeries(
    (dailyRows as Array<{ day: string; views: number }>).map((r) => ({ day: r.day, views: Number(r.views) })),
    now,
  );
  const events = (totalViews: number): Partial<ArtifactEventRollup> =>
    eventRows ? rollupArtifactEvents(eventRows, totalViews) : {};

  // Engagement unit defaults from the kind — time-based studio kinds
  // (video / podcast / voice / animation) and scrollable text (resume /
  // article) bucket per second; everything else is percent-scrolled.
  // Reuses the SSoT predicate from shared/artifact-views.ts so the
  // wire shape and the in-memory math stay in lockstep.
  const defaultUnit: "s" | "%" =
    kind === "video" ||
    kind === "podcast" ||
    kind === "voice" ||
    kind === "animation"
      ? "s"
      : "%";
  if (views.length === 0) {
    // Impressions can exist before anyone clicks through to a view.
    return { ...EMPTY_METRICS, ...events(0), heatmapUnit: defaultUnit, viewsOverTime };
  }

  const totalViews = views.length;
  const engagementUnit = (views[0].engagementUnit as "s" | "%") ?? defaultUnit;

  // Bucket sum. Video buckets are per-second; static buckets are 100
  // percent-scrolled. The math is identical — sum element-wise, then
  // express each bucket as a 0-100% of views that reached it.
  const bucketLengths = views
    .map((v) => (Array.isArray(v.engagement) ? (v.engagement as number[]).length : 0));
  const maxBuckets = Math.max(0, ...bucketLengths);
  const heatmap = maxBuckets > 0 ? new Array(maxBuckets).fill(0) : [];
  for (const v of views) {
    const arr = (v.engagement as number[] | null) ?? null;
    if (!arr) continue;
    for (let i = 0; i < arr.length; i++) {
      if (arr[i]) heatmap[i] = (heatmap[i] ?? 0) + 1;
    }
  }
  const normalizedHeatmap = heatmap.map((c: number) =>
    Math.round((c / totalViews) * 100),
  );

  const avgWatchSec = Math.round(
    views.reduce((a, v) => a + (v.totalEngagementSec ?? 0), 0) / totalViews,
  );
  const avgPercentWatched = Math.round(
    (views.reduce((a, v) => a + (v.percentConsumed ?? 0), 0) / totalViews) * 100,
  );

  // Top drop-off bucket — most common drop_off_bucket across all views.
  const dropOffs: Record<number, number> = {};
  for (const v of views) {
    if (v.dropOffBucket != null) {
      dropOffs[v.dropOffBucket] = (dropOffs[v.dropOffBucket] ?? 0) + 1;
    }
  }
  const topDropOffSecond = Object.entries(dropOffs).sort(([, a], [, b]) => b - a)[0]?.[0];

  // Viewer dedup keyed on email > viewerId > anonymous.
  const viewerMap = new Map<
    string,
    { email?: string; company?: string; lastViewed: string; views: number; avgPercent: number }
  >();
  for (const v of views) {
    const key = v.viewerEmail ?? v.viewerId ?? "anonymous";
    const pct = Math.round((v.percentConsumed ?? 0) * 100);
    const ex = viewerMap.get(key);
    if (ex) {
      ex.views += 1;
      ex.avgPercent = Math.round(
        (ex.avgPercent * (ex.views - 1) + pct) / ex.views,
      );
    } else {
      viewerMap.set(key, {
        email: v.viewerEmail ?? undefined,
        company: v.viewerCompany ?? undefined,
        lastViewed: v.viewedAt?.toISOString?.() ?? new Date().toISOString(),
        views: 1,
        avgPercent: pct,
      });
    }
  }
  const viewers = Array.from(viewerMap.entries()).map(([id, x]) => ({
    id,
    ...x,
  }));

  // Referrer hostname rollup — strip protocol/path so peers collapse.
  const referrerCounts = new Map<string, number>();
  for (const v of views) {
    const raw = v.referrer?.trim();
    let source = "Direct";
    if (raw) {
      try {
        source = new URL(raw).hostname.replace(/^www\./, "");
      } catch {
        source = raw.slice(0, 100);
      }
    }
    referrerCounts.set(source, (referrerCounts.get(source) ?? 0) + 1);
  }
  const referrers = Array.from(referrerCounts.entries())
    .map(([source, c]) => ({ source, views: c }))
    .sort((a, b) => b.views - a.views);

  // Country histogram from ip_country (ISO-3166 alpha-2). NULL → "ZZ".
  const countryCounts = new Map<string, number>();
  for (const v of views) {
    const cc = (v.ipCountry ?? "ZZ").toUpperCase();
    countryCounts.set(cc, (countryCounts.get(cc) ?? 0) + 1);
  }
  const countries = Array.from(countryCounts.entries())
    .map(([country, c]) => ({ country, views: c }))
    .sort((a, b) => b.views - a.views);

  return {
    totalViews,
    ...events(totalViews),
    avgWatchSec,
    avgPercentWatched,
    heatmap: normalizedHeatmap,
    topDropOffSecond: topDropOffSecond != null ? Number(topDropOffSecond) : null,
    heatmapUnit: engagementUnit,
    viewers,
    referrers,
    countries,
    viewsOverTime,
  };
}

// ─── Cached read (#861) ───────────────────────────────────────────────────

function metricsCacheKey(kind: ArtifactKind, artifactId: string): string {
  return `artifact-metrics:v1:${kind}:${artifactId}`;
}

/**
 * Owner-facing metrics read through the L1 + KV cache, with a short TTL and
 * NO per-view invalidation.
 *
 * Why not invalidate on insert: Workers Free allows 1,000 KV writes/deletes
 * per day across the whole account, and every public view would cost one
 * delete — a single popular résumé could exhaust the quota. Why not a
 * version token: bumping it is also a KV write per view (or needs its own
 * throttle state). With a TTL only, KV writes happen on cache FILLS, which
 * are driven by owners opening their analytics (≤ 1 fill per artifact per
 * TTL window), not by viewers. The cost is up to METRICS_TTL_SECONDS of
 * staleness on a dashboard that is not real-time anyway.
 */
export const METRICS_TTL_SECONDS = 120;

export function getArtifactMetrics(kind: ArtifactKind, artifactId: string): Promise<ArtifactMetricsDTO> {
  return getOrSetCached<ArtifactMetricsDTO>({
    key: metricsCacheKey(kind, artifactId),
    ttlSeconds: METRICS_TTL_SECONDS,
    loader: () => buildArtifactMetrics(kind, artifactId),
  });
}
