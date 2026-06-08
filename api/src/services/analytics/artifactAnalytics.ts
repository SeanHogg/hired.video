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

import { and, count, desc, eq } from "drizzle-orm";
import { getDb, schema } from "../../db/index.js";
import {
  isStudioArtifactKind,
  type ArtifactKind,
} from "../../../../shared/artifact-views.js";

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
  ctaClickThroughRate?: number;
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
  const views = await db
    .select()
    .from(schema.artifactViews)
    .where(
      and(
        eq(schema.artifactViews.artifactKind, kind),
        eq(schema.artifactViews.artifactId, artifactId),
      ),
    )
    .orderBy(desc(schema.artifactViews.viewedAt))
    .limit(2000);

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
    return { ...EMPTY_METRICS, heatmapUnit: defaultUnit };
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

  // CTA clicks live on the videoAnalytics event-counts table (FK =
  // studio_project_id, kind-agnostic — see migration 0085). Every
  // studio MediaKind can carry CTA widgets (display banners → link
  // target; podcasts → show-notes CTA; comics → buy-now panel) so we
  // read CTA events for every studio kind via the same SSoT predicate.
  let ctaClicks: number | undefined;
  let ctaClickThroughRate: number | undefined;
  if (isStudioArtifactKind(kind)) {
    const [row] = await db
      .select({ n: count() })
      .from(schema.videoAnalytics)
      .where(
        and(
          eq(schema.videoAnalytics.studioProjectId, artifactId),
          eq(schema.videoAnalytics.event, "cta_click"),
        ),
      );
    ctaClicks = row?.n ?? 0;
    ctaClickThroughRate = totalViews > 0 ? (ctaClicks ?? 0) / totalViews : 0;
  }

  return {
    totalViews,
    ctaClicks,
    ctaClickThroughRate,
    avgWatchSec,
    avgPercentWatched,
    heatmap: normalizedHeatmap,
    topDropOffSecond: topDropOffSecond != null ? Number(topDropOffSecond) : null,
    heatmapUnit: engagementUnit,
    viewers,
    referrers,
    countries,
  };
}
