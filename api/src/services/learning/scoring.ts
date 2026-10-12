/**
 * SCORM / xAPI scoring helpers — single seam for all "did the learner pass?"
 * comparisons. Gap #1606 closure.
 *
 * The SCORM 1.2 runtime exposes `cmi.core.score.raw / score.min / score.max`
 * as STRINGS (per the SCORM CMI data model) and packages emit these on a
 * per-package scale (e.g. raw=85, min=0, max=100; or raw=42, min=0, max=50).
 * The cert-issuance gate at `courses.passing_score_pct` is an INTEGER 0..100.
 * Comparing the unscaled float `score_raw` directly against the percent gate
 * caused rounding bugs (e.g. raw=69, max=100 read from JSON as 68.9999…
 * comparing < 70 fails) and per-package-scale drift.
 *
 * This module is the only place those comparisons happen. Consumers route
 * SCORM rows + xAPI statements through `toBasisPoints` (returns 0..10000)
 * and `passesGate` (boolean) — the DB column type stays `real` (matches
 * the SCORM runtime API), and the comparison is integer-stable.
 *
 * DRY: every "passed?" check across the codebase MUST go through
 * `passesGate`. Inline `if (cmi.score_raw >= passingScore) ...` is the
 * anti-pattern this module exists to prevent.
 */

/**
 * Convert a SCORM score triple (raw, min, max) to basis points (0..10000
 * representing 0.00%..100.00%). Returns null when the inputs don't form a
 * meaningful percentage (missing raw or zero-range).
 *
 * @example
 *   toBasisPoints(85, 0, 100)   // 8500
 *   toBasisPoints(42, 0, 50)    // 8400 (84.00%)
 *   toBasisPoints(null, 0, 100) // null
 */
export function toBasisPoints(
  scoreRaw: number | null | undefined,
  scoreMin: number | null | undefined,
  scoreMax: number | null | undefined,
): number | null {
  if (scoreRaw == null || !Number.isFinite(scoreRaw)) return null;
  const minVal = scoreMin ?? 0;
  const maxVal = scoreMax ?? 100;
  const range = maxVal - minVal;
  if (range <= 0) return null;

  const normalised = (scoreRaw - minVal) / range;
  const clamped = Math.max(0, Math.min(1, normalised));
  return Math.round(clamped * 10000);
}

/**
 * Test whether a SCORM score triple passes a cert-issuance gate. The gate
 * is expressed as a percentage 0..100 (matching `courses.passing_score_pct`
 * in the schema).
 *
 * @example
 *   passesGate({ scoreRaw: 85, scoreMin: 0, scoreMax: 100 }, 70)   // true
 *   passesGate({ scoreRaw: 65, scoreMin: 0, scoreMax: 100 }, 70)   // false
 *   passesGate({ scoreRaw: null }, 70)                              // false
 */
export function passesGate(
  score: { scoreRaw: number | null; scoreMin?: number | null; scoreMax?: number | null },
  passingScorePct: number,
): boolean {
  const bp = toBasisPoints(score.scoreRaw, score.scoreMin, score.scoreMax);
  if (bp == null) return false;
  const gateBp = passingScorePct * 100;
  return bp >= gateBp;
}

/**
 * Combine multiple per-lesson scores into a single course-level basis-point
 * value. Each lesson contributes its weight; missing scores fall through
 * as zero so a partially-completed course doesn't accidentally pass.
 *
 * Returns null when no lesson has a usable score (empty input or all-null).
 */
export function aggregateBasisPoints(
  lessons: Array<{
    scoreRaw: number | null;
    scoreMin?: number | null;
    scoreMax?: number | null;
    weight?: number;
  }>,
): number | null {
  if (lessons.length === 0) return null;
  let weightedSum = 0;
  let totalWeight = 0;
  let anyScored = false;
  for (const lesson of lessons) {
    const w = lesson.weight ?? 1;
    if (w <= 0) continue;
    totalWeight += w;
    const bp = toBasisPoints(lesson.scoreRaw, lesson.scoreMin, lesson.scoreMax);
    if (bp != null) {
      anyScored = true;
      weightedSum += bp * w;
    }
  }
  if (!anyScored || totalWeight === 0) return null;
  return Math.round(weightedSum / totalWeight);
}
