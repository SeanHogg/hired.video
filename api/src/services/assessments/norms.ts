/**
 * Predictive-assessment norming helpers.
 *
 *   percentileForScore(curve, score) — given the 101-entry percentile
 *     curve cached in `assessment_dimension_norms.percentile_curve`,
 *     return the percentile band [0..100] that `score` falls into.
 *     Binary search; pure; no DB.
 *
 *   computePercentileCurve(scores) — given the raw 0..1 dimension
 *     scores from every completed run for one (kind, dimension),
 *     produce the 101-entry curve to cache. The recompute worker
 *     calls this per (kind, dimension) on its schedule.
 *
 *   fetchNorm(kind, dimension) — DB lookup through the canonical edge
 *     cache (key `assessment-norm:v1:<kind>:<dimension>`, 1h TTL).
 *     The recompute worker calls `invalidateNormCache` after each upsert.
 */

import { and, eq } from "drizzle-orm";
import { getDb, schema } from "../../db/index.js";
import { getOrSetCached, invalidateCachedKey } from "../../utils/edge-cache.js";

/** Build the 101-entry percentile curve from a population of raw scores.
 *  Returns null when the sample is too small to be defensible (under 25). */
export function computePercentileCurve(scores: number[]): number[] | null {
  const cleaned = scores.filter((s) => typeof s === "number" && Number.isFinite(s));
  if (cleaned.length < 25) return null;
  const sorted = [...cleaned].sort((a, b) => a - b);
  const curve: number[] = [];
  for (let p = 0; p <= 100; p++) {
    // Nearest-rank percentile — index = ceil((p/100) * N) - 1, clamped.
    const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
    curve.push(Number(sorted[idx].toFixed(4)));
  }
  return curve;
}

/** Binary-search the curve for the percentile a score falls into.
 *  Returns 0..100. Inclusive: an exact match on curve[p] returns p. */
export function percentileForScore(curve: number[], score: number): number {
  if (!curve || curve.length === 0) return 50; // safe default
  if (score <= curve[0]) return 0;
  if (score >= curve[curve.length - 1]) return 100;
  let lo = 0;
  let hi = curve.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (curve[mid] < score) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

export interface DimensionNorm {
  curve: number[];
  sampleSize: number;
  recomputedAt: string;
}

/** Norms only change when the daily recompute worker runs (which
 *  invalidates explicitly), so 1h is a pure backstop. */
const NORM_CACHE_TTL_SECONDS = 60 * 60;

function normCacheKey(kind: string, dimension: string): string {
  return `assessment-norm:v1:${kind}:${dimension}`;
}

/** Look up the cached norm row; null if not yet computed for this pair.
 *  DimensionNorm is JSON-safe (recomputedAt is an ISO string). A DB error
 *  returns null WITHOUT caching it. */
export async function fetchNorm(kind: string, dimension: string): Promise<DimensionNorm | null> {
  return getOrSetCached<DimensionNorm | null>({
    key: normCacheKey(kind, dimension),
    ttlSeconds: NORM_CACHE_TTL_SECONDS,
    loader: () => loadNorm(kind, dimension),
  }).catch(() => null);
}

async function loadNorm(kind: string, dimension: string): Promise<DimensionNorm | null> {
  const t = schema.assessmentDimensionNorms;
  const db = getDb();
  const [row] = await db
    .select({
      curve: t.percentileCurve,
      sampleSize: t.sampleSize,
      recomputedAt: t.recomputedAt,
    })
    .from(t)
    .where(and(eq(t.assessmentKind, kind), eq(t.dimension, dimension)))
    .limit(1);
  if (!row) return null;
  return toDimensionNorm(row);
}

function kindNormsCacheKey(kind: string): string {
  return `assessment-norms:v1:${kind}`;
}

function toDimensionNorm(row: { curve: unknown; sampleSize: unknown; recomputedAt: unknown }): DimensionNorm {
  const at = row.recomputedAt;
  return {
    curve: row.curve as number[],
    sampleSize: row.sampleSize as number,
    recomputedAt: (at instanceof Date ? at : new Date(at as string)).toISOString(),
  };
}

/**
 * Every computed norm for one assessment kind, keyed by dimension — ONE
 * cached read / ONE query instead of a `fetchNorm` per dimension. Dimensions
 * without a norm yet are absent. A DB error yields an empty map (uncached).
 */
export async function fetchNormsForKind(kind: string): Promise<Map<string, DimensionNorm>> {
  const record = await getOrSetCached<Record<string, DimensionNorm>>({
    key: kindNormsCacheKey(kind),
    ttlSeconds: NORM_CACHE_TTL_SECONDS,
    loader: () => loadNormsForKind(kind),
  }).catch(() => ({} as Record<string, DimensionNorm>));
  return new Map(Object.entries(record));
}

async function loadNormsForKind(kind: string): Promise<Record<string, DimensionNorm>> {
  const t = schema.assessmentDimensionNorms;
  const rows = await getDb()
    .select({
      dimension: t.dimension,
      curve: t.percentileCurve,
      sampleSize: t.sampleSize,
      recomputedAt: t.recomputedAt,
    })
    .from(t)
    .where(eq(t.assessmentKind, kind));
  const out: Record<string, DimensionNorm> = {};
  for (const row of rows) out[row.dimension] = toDimensionNorm(row);
  return out;
}

/** Drop the cached norm for one (kind, dimension) — and the per-kind batch
 *  entry that includes it. Called by the recompute worker after every upsert. */
export function invalidateNormCache(kind: string, dimension: string): void {
  invalidateCachedKey(normCacheKey(kind, dimension));
  invalidateCachedKey(kindNormsCacheKey(kind));
}
