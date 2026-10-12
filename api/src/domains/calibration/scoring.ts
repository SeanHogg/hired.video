/**
 * Pure calibration-scoring helpers (#1381).
 *
 * Given a session's calibration submissions + the matching cohort of
 * real-hiring submissions, produce per-attribute deltas so the
 * organizer can see who scores tighter / looser / more consistently
 * than the original hiring cohort.
 */

import type { CalibrationSubmissionRow } from "../../repositories/calibrationRepository.js";

export interface AttributeDelta {
  attributeId: string;
  /** Mean rating across all calibration evaluators for this attribute. */
  calibrationMean: number | null;
  /** Mean rating across all real-hiring submissions for this attribute. */
  realMean: number | null;
  /** calibrationMean - realMean (positive = calibrators rate higher). */
  delta: number | null;
  /** Sample sizes so the consumer can warn on thin data. */
  calibrationSamples: number;
  realSamples: number;
}

function meanOrNull(values: readonly (number | null | undefined)[]): {
  mean: number | null;
  count: number;
} {
  const real = values.filter((v): v is number => typeof v === "number");
  if (real.length === 0) return { mean: null, count: 0 };
  return { mean: real.reduce((a, b) => a + b, 0) / real.length, count: real.length };
}

export function computeCalibrationDeltas(opts: {
  candidates: readonly string[];
  calibrationSubmissions: readonly CalibrationSubmissionRow[];
  realRatingsByApplication: Record<
    string,
    readonly { attributeId: string; rating: number | null }[]
  >;
}): Record<string, AttributeDelta[]> {
  const out: Record<string, AttributeDelta[]> = {};

  for (const applicationId of opts.candidates) {
    const calibrationForApp = opts.calibrationSubmissions.filter(
      (s) => s.applicationId === applicationId,
    );
    const realRatings = opts.realRatingsByApplication[applicationId] ?? [];

    // Collect attribute ids referenced by either side.
    const attributeIds = new Set<string>();
    for (const sub of calibrationForApp) {
      for (const attr of Object.keys(sub.ratings ?? {})) attributeIds.add(attr);
    }
    for (const r of realRatings) attributeIds.add(r.attributeId);

    const rows: AttributeDelta[] = [];
    for (const attributeId of attributeIds) {
      const calValues = calibrationForApp.map((sub) =>
        (sub.ratings as Record<string, number | null>)[attributeId],
      );
      const realValues = realRatings
        .filter((r) => r.attributeId === attributeId)
        .map((r) => r.rating);
      const cal = meanOrNull(calValues);
      const real = meanOrNull(realValues);
      const delta =
        cal.mean !== null && real.mean !== null
          ? Number((cal.mean - real.mean).toFixed(2))
          : null;
      rows.push({
        attributeId,
        calibrationMean: cal.mean !== null ? Number(cal.mean.toFixed(2)) : null,
        realMean: real.mean !== null ? Number(real.mean.toFixed(2)) : null,
        delta,
        calibrationSamples: cal.count,
        realSamples: real.count,
      });
    }
    out[applicationId] = rows;
  }
  return out;
}
