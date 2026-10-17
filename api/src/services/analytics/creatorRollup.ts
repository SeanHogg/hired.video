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

import { and, count, desc, eq } from "drizzle-orm";
import { getDb, schema } from "../../db/index.js";
import { isArtifactView } from "../../repositories/artifactViewStreams.js";
import type { ArtifactKind } from "../../../../shared/artifact-views.js";
import {
  CreatorAnalyticsRepository,
  fallbackArtifactMeta,
} from "../../repositories/creatorAnalyticsRepository.js";

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

  const repo = new CreatorAnalyticsRepository(db);

  // ── Per-artifact totals ──────────────────────────────────────────────
  // ONE GROUP BY (artifact_kind, artifact_id) over the polymorphic view
  // table carries total views, AVG percent_consumed, last view AND the
  // unique-viewer count (count distinct viewer key) — no per-row query.
  const aggRows = await repo.findArtifactTotalsForOwner(userId);

  // Enrich with title + thumbnail: one inArray read per artifact KIND
  // (not per artifact). Capped at 200 artifacts to keep the dashboard
  // fast — a creator with >200 artifacts needs a paginated /content view.
  const top = aggRows.slice(0, 200);
  const idsByKind = new Map<ArtifactKind, string[]>();
  for (const row of top) {
    const kind = row.artifactKind as ArtifactKind;
    const list = idsByKind.get(kind) ?? [];
    list.push(row.artifactId);
    idsByKind.set(kind, list);
  }
  const metaByKind = new Map(
    await Promise.all(
      Array.from(idsByKind.entries()).map(
        async ([kind, ids]) => [kind, await repo.findArtifactMeta(kind, ids)] as const,
      ),
    ),
  );

  const enriched = top.map((row) => {
    const kind = row.artifactKind as ArtifactKind;
    const meta =
      metaByKind.get(kind)?.get(row.artifactId) ?? fallbackArtifactMeta(kind, row.artifactId);
    return {
      artifactKind: kind,
      artifactId: row.artifactId,
      title: meta.title,
      thumbnail: meta.thumbnail,
      totalViews: row.totalViews,
      uniqueViewers: row.uniqueViewers,
      avgPercentConsumed: Math.round(Number(row.avgPct ?? 0) * 100),
      lastViewedAt: row.lastViewedAt ? new Date(row.lastViewedAt).toISOString() : null,
    } satisfies CreatorArtifactRow;
  });

  // ── Top-line totals ──────────────────────────────────────────────────
  const totalViews = enriched.reduce((a, r) => a + r.totalViews, 0);
  // Cross-artifact unique viewers — same dedup expression, one query.
  const uniqueViewers = await repo.countUniqueViewersForOwner(userId);

  // Cross-artifact country histogram. Hard-cap at 250 distinct countries —
  // there are 249 ISO-3166 codes so any creator will hit the practical ceiling
  // long before the cap matters; the bound guards against malformed/spoofed
  // codes inflating the result set (gap #1333).
  const countryRows = await db
    .select({
      country: schema.artifactViews.ipCountry,
      views: count(),
    })
    .from(schema.artifactViews)
    .where(and(eq(schema.artifactViews.ownerUserId, userId), isArtifactView()))
    .groupBy(schema.artifactViews.ipCountry)
    .orderBy(desc(count()))
    .limit(250);
  const countries = countryRows.map((r) => ({
    country: (r.country ?? "ZZ").toUpperCase(),
    views: Number(r.views ?? 0),
  }));

  // Cross-artifact referrer rollup (gap #1333). Previously fetched EVERY
  // referrer row for the user — a creator with 1M+ views OOMed the Worker
  // (128 MB limit). Now: GROUP BY in SQL + LIMIT 500 distinct referrer URLs,
  // then hostname-collapse in app code (URL parsing isn't portable across
  // Postgres versions). The 500-row cap bounds Worker memory; the JS
  // aggregation collapses subdomain churn into ~10–50 final hostnames.
  const referrerRows = await db
    .select({
      referrer: schema.artifactViews.referrer,
      views: count(),
    })
    .from(schema.artifactViews)
    .where(and(eq(schema.artifactViews.ownerUserId, userId), isArtifactView()))
    .groupBy(schema.artifactViews.referrer)
    .orderBy(desc(count()))
    .limit(500);
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
    referrerCounts.set(source, (referrerCounts.get(source) ?? 0) + Number(r.views ?? 0));
  }
  const referrers = Array.from(referrerCounts.entries())
    .map(([source, c]) => ({ source, views: c }))
    .sort((a, b) => b.views - a.views);

  return {
    totals: {
      totalViews,
      uniqueViewers,
      countriesReached: countries.filter((c) => c.country !== "ZZ").length,
      artifactCount: enriched.length,
    },
    countries,
    referrers,
    artifacts: enriched,
  };
}
