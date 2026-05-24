/**
 * creatorRollup.ts — backs `GET /api/analytics/creator/me`, the unified
 * stats surface for the content-creator dashboard (Gap Register #1019 L5).
 *
 * One GROUP BY over artifact_views produces a per-artifact totals row;
 * we then enrich each row with the artifact's title + thumbnail by joining
 * back to the kind-specific entity table. Cross-cuts (top countries,
 * top referrers, top-performing artifact) are derived from the same
 * source data so the page can't drift from the per-artifact drawer.
 */

import { and, count, desc, eq, sql } from "drizzle-orm";
import { getDb, schema } from "../../db/index.js";
import type { ArtifactKind } from "../../../../shared/artifact-views.js";

export interface CreatorArtifactRow {
  artifactKind: ArtifactKind;
  artifactId: string;
  title: string;
  thumbnail: string | null;
  totalViews: number;
  uniqueViewers: number;
  avgPercentConsumed: number; // 0..100 for display
  lastViewedAt: string | null;
}

export interface CreatorRollup {
  totals: {
    totalViews: number;
    uniqueViewers: number;
    countriesReached: number;
    artifactCount: number;
  };
  /** Cross-artifact top countries. */
  countries: Array<{ country: string; views: number }>;
  /** Cross-artifact referrer breakdown (hostnames). */
  referrers: Array<{ source: string; views: number }>;
  /** Per-artifact summary rows, sorted by totalViews DESC. */
  artifacts: CreatorArtifactRow[];
}

export async function buildCreatorRollup(userId: string): Promise<CreatorRollup> {
  const db = getDb();

  // ── Per-artifact totals ──────────────────────────────────────────────
  // GROUP BY (artifact_kind, artifact_id) over the polymorphic view
  // table. AVG percent_consumed * 100 → display percent. COUNT distinct
  // viewer key (email > viewer_id > ip_hash) for unique-viewer count;
  // that's not trivial in one SQL pass, so we sum totalViews here and
  // do the unique-viewer dedup in app code below using the raw rows.
  const aggRows = await db
    .select({
      artifactKind: schema.artifactViews.artifactKind,
      artifactId: schema.artifactViews.artifactId,
      totalViews: count(),
      avgPct: sql<number>`avg(${schema.artifactViews.percentConsumed})`,
      lastViewedAt: sql<Date | null>`max(${schema.artifactViews.viewedAt})`,
    })
    .from(schema.artifactViews)
    .where(eq(schema.artifactViews.ownerUserId, userId))
    .groupBy(schema.artifactViews.artifactKind, schema.artifactViews.artifactId)
    .orderBy(desc(count()));

  // Enrich each row with title + thumbnail per kind. Done in parallel,
  // but capped at 200 artifacts to keep the dashboard fast — a creator
  // with >200 artifacts will need a paginated /content view.
  const enriched = await Promise.all(
    aggRows.slice(0, 200).map(async (row) => {
      const meta = await fetchArtifactMeta(
        row.artifactKind as ArtifactKind,
        row.artifactId,
      );
      // Unique-viewer count per artifact — small extra query but cheap
      // because the rollup is owner-scoped.
      const [uniq] = await db
        .select({
          n: sql<number>`count(distinct coalesce(${schema.artifactViews.viewerEmail}, ${schema.artifactViews.viewerId}::text, ${schema.artifactViews.ipHash}, 'anonymous'))`,
        })
        .from(schema.artifactViews)
        .where(
          and(
            eq(schema.artifactViews.artifactKind, row.artifactKind),
            eq(schema.artifactViews.artifactId, row.artifactId),
          ),
        );
      return {
        artifactKind: row.artifactKind as ArtifactKind,
        artifactId: row.artifactId,
        title: meta.title,
        thumbnail: meta.thumbnail,
        totalViews: Number(row.totalViews ?? 0),
        uniqueViewers: Number(uniq?.n ?? 0),
        avgPercentConsumed: Math.round(Number(row.avgPct ?? 0) * 100),
        lastViewedAt: row.lastViewedAt
          ? new Date(row.lastViewedAt).toISOString()
          : null,
      } satisfies CreatorArtifactRow;
    }),
  );

  // ── Top-line totals ──────────────────────────────────────────────────
  const totalViews = enriched.reduce((a, r) => a + r.totalViews, 0);
  // Cross-artifact unique viewers — same dedup expression, one query.
  const [u] = await db
    .select({
      n: sql<number>`count(distinct coalesce(${schema.artifactViews.viewerEmail}, ${schema.artifactViews.viewerId}::text, ${schema.artifactViews.ipHash}, 'anonymous'))`,
    })
    .from(schema.artifactViews)
    .where(eq(schema.artifactViews.ownerUserId, userId));

  // Cross-artifact country histogram.
  const countryRows = await db
    .select({
      country: schema.artifactViews.ipCountry,
      views: count(),
    })
    .from(schema.artifactViews)
    .where(eq(schema.artifactViews.ownerUserId, userId))
    .groupBy(schema.artifactViews.ipCountry)
    .orderBy(desc(count()));
  const countries = countryRows.map((r) => ({
    country: (r.country ?? "ZZ").toUpperCase(),
    views: Number(r.views ?? 0),
  }));

  // Cross-artifact referrer rollup (hostname-collapsed in app code so
  // SQL doesn't need to know about URL parsing).
  const referrerRows = await db
    .select({ referrer: schema.artifactViews.referrer })
    .from(schema.artifactViews)
    .where(eq(schema.artifactViews.ownerUserId, userId));
  const referrerCounts = new Map<string, number>();
  for (const r of referrerRows) {
    const raw = r.referrer?.trim();
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

  return {
    totals: {
      totalViews,
      uniqueViewers: Number(u?.n ?? 0),
      countriesReached: countries.filter((c) => c.country !== "ZZ").length,
      artifactCount: enriched.length,
    },
    countries,
    referrers,
    artifacts: enriched,
  };
}

interface ArtifactMeta {
  title: string;
  thumbnail: string | null;
}

async function fetchArtifactMeta(
  kind: ArtifactKind,
  id: string,
): Promise<ArtifactMeta> {
  const db = getDb();
  try {
    switch (kind) {
      case "video": {
        // Studio projects don't have title/thumbnail columns — the
        // display title is derived from the storyboard JSONB's `_name`
        // key (see api/src/routes/studio.ts:toProjectDto). Pull the
        // storyboard and project the same fields here.
        const [r] = await db
          .select({
            storyboard: schema.studioProjects.storyboard,
            resumeText: schema.studioProjects.resumeText,
          })
          .from(schema.studioProjects)
          .where(eq(schema.studioProjects.id, id))
          .limit(1);
        const meta = (r?.storyboard ?? null) as Record<string, unknown> | null;
        const savedName = meta?._name as string | undefined;
        const title = savedName || r?.resumeText?.slice(0, 80) || "Untitled video";
        return { title, thumbnail: null };
      }
      case "resume": {
        const [r] = await db
          .select({ title: schema.resumeInformation.title })
          .from(schema.resumeInformation)
          .where(eq(schema.resumeInformation.id, id))
          .limit(1);
        return { title: r?.title ?? "Untitled resume", thumbnail: null };
      }
      case "company": {
        const [r] = await db
          .select({
            name: schema.companyProfiles.name,
            logoUrl: schema.companyProfiles.logoUrl,
          })
          .from(schema.companyProfiles)
          .where(eq(schema.companyProfiles.id, id))
          .limit(1);
        return { title: r?.name ?? "Untitled company", thumbnail: r?.logoUrl ?? null };
      }
      case "profile": {
        const [r] = await db
          .select({ name: schema.users.name })
          .from(schema.users)
          .where(eq(schema.users.id, id))
          .limit(1);
        return { title: r?.name ?? "Profile", thumbnail: null };
      }
      case "job": {
        const [r] = await db
          .select({ title: schema.jobItems.title })
          .from(schema.jobItems)
          .where(eq(schema.jobItems.id, id))
          .limit(1);
        return { title: (r as any)?.title ?? "Untitled job", thumbnail: null };
      }
      default:
        return { title: `${kind}:${id.slice(0, 6)}`, thumbnail: null };
    }
  } catch {
    return { title: `${kind}:${id.slice(0, 6)}`, thumbnail: null };
  }
}
