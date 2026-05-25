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
 *   fetchNorm(kind, dimension) — DB lookup with a per-request memo so
 *     a single /complete request that scores 6 dimensions only touches
 *     the table 6 times max (and benefits from per-request caching
 *     within the same handler).
 */

import { and, eq } from "drizzle-orm";
import { getDb, schema } from "../../db/index.js";

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

const memo = new Map<string, DimensionNorm | null>();

function memoKey(kind: string, dimension: string): string {
  return `${kind}::${dimension}`;
}

/** Look up the cached norm row; null if not yet computed for this pair.
 *  Memoised per process — a single request that scores N dimensions
 *  for the same kind only hits the DB N times max across the request
 *  lifecycle. (Worker isolates die quickly so the memo doesn't grow
 *  unbounded.) */
export async function fetchNorm(kind: string, dimension: string): Promise<DimensionNorm | null> {
  const key = memoKey(kind, dimension);
  if (memo.has(key)) return memo.get(key) ?? null;
  const t = (schema as any).assessmentDimensionNorms;
  if (!t) {
    memo.set(key, null);
    return null;
  }
  const db = getDb();
  const [row] = await db
    .select({
      curve: t.percentileCurve,
      sampleSize: t.sampleSize,
      recomputedAt: t.recomputedAt,
    })
    .from(t)
    .where(and(eq(t.assessmentKind, kind), eq(t.dimension, dimension)))
    .limit(1)
    .catch(() => [] as any[]);
  if (!row) {
    memo.set(key, null);
    return null;
  }
  const value: DimensionNorm = {
    curve: row.curve as number[],
    sampleSize: row.sampleSize as number,
    recomputedAt: (row.recomputedAt instanceof Date ? row.recomputedAt : new Date(row.recomputedAt)).toISOString(),
  };
  memo.set(key, value);
  return value;
}

/** Test-only hook to clear the per-process memo between cases. */
export function __clearNormMemoForTests(): void {
  memo.clear();
}
