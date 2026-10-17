/**
 * artifactEventRollup.ts — pure rollup of studio playback event counts
 * (artifact_views cta_click / impression rows; was `video_analytics`)
 * into the CTA / impression metrics on ArtifactMetricsDTO (#1140).
 *
 * `buildArtifactMetrics` fetches the per-event counts in ONE grouped query
 * (`SELECT event, count(*) … WHERE event IN (ROLLUP_EVENTS) GROUP BY
 * event`) and hands the rows here, so the math is unit-testable without
 * a database.
 *
 *   ctaClickThroughRate = ctaClicks / totalViews   (in-platform views)
 *   impressionCtr       = ctaClicks / impressions  (paid-media impressions)
 *
 * Both rates guard divide-by-zero and return 0 when the denominator is 0.
 *
 * NOTE (#1139): nothing ingests `impression` rows yet — the producer is
 * the ad-network webhook / CSV import (#1137) named in
 * shared/studio-analytics-events.ts. Until it exists `impressionCount`
 * reads 0 and `impressionCtr` reads 0.
 */

import type { StudioAnalyticsEvent } from "../../../../shared/studio-analytics-events.js";

/** Studio events the artifact rollup reads (artifact_views event types). */
export const ROLLUP_EVENTS = ["cta_click", "impression"] as const satisfies readonly StudioAnalyticsEvent[];

export interface EventCountRow {
  event: string;
  /** Postgres count() can surface as string through some drivers. */
  n: number | string | null;
}

export interface ArtifactEventRollup {
  ctaClicks: number;
  ctaClickThroughRate: number;
  impressionCount: number;
  impressionCtr: number;
}

function toCount(value: number | string | null | undefined): number {
  const n = typeof value === "string" ? Number(value) : value ?? 0;
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

function ratio(numerator: number, denominator: number): number {
  return denominator > 0 ? numerator / denominator : 0;
}

/** Fold grouped event counts + the view total into the DTO metrics.
 *  Duplicate rows for the same event are summed; unknown events ignored. */
export function rollupArtifactEvents(
  rows: readonly EventCountRow[],
  totalViews: number,
): ArtifactEventRollup {
  let ctaClicks = 0;
  let impressionCount = 0;
  for (const row of rows) {
    if (row.event === "cta_click") ctaClicks += toCount(row.n);
    else if (row.event === "impression") impressionCount += toCount(row.n);
  }
  return {
    ctaClicks,
    ctaClickThroughRate: ratio(ctaClicks, totalViews),
    impressionCount,
    impressionCtr: ratio(ctaClicks, impressionCount),
  };
}
