/**
 * Pure domain rules for the structured-hiring scorecards bounded context.
 *
 * Contains no I/O, no Drizzle, no Hono — only logic that the repository
 * layer or a test can call directly. Anything in here must be deterministic
 * given its inputs.
 *
 * Two main functions today:
 *   • computeOverallScore — weighted-mean reduction of per-attribute
 *     ratings into a single 0-100 overall score.
 *   • buildAggregateSnapshot — recommendation tally + average score across
 *     a set of submitted scorecards (used by both the debrief view and
 *     the snapshot frozen at hiring-decision time).
 */

import type {
  Recommendation,
  RatingScale,
} from "./schemas.js";

export interface RatedAttribute {
  /** Stable attribute identifier. */
  id: string;
  /** Per-attribute weight (>= 1). */
  weight: number;
}

export interface AttributeRating {
  attributeId: string;
  /** Null/undefined = not rated; treated as missing. */
  rating: number | null | undefined;
}

/**
 * Maximum value for a given rating scale. Accepts plain string so callers
 * can pass a column value straight from the DB row; an unknown scale
 * value falls back to the "1-4" default rather than crashing.
 *
 * Centralising this here means adding a new scale only requires updating
 * one place, and `computeOverallScore` doesn't need to know the scales.
 */
export function maxRatingForScale(scale: string | RatingScale): number {
  switch (scale) {
    case "1-4":
      return 4;
    case "1-5":
      return 5;
    case "thumbs":
    case "yes-no":
      return 1;
    default:
      return 4;
  }
}

/**
 * Compute a 0-100 weighted overall score from per-attribute ratings.
 *
 * The score is `sum(rating/max * weight) / sum(weight)` over the rated
 * attributes only — unrated attributes drop out of both numerator and
 * denominator so a partial fill doesn't artificially deflate the score.
 *
 * Returns null when no attribute has a rating.
 */
export function computeOverallScore(
  attributes: readonly RatedAttribute[],
  ratings: readonly AttributeRating[],
  scale: string | RatingScale,
): number | null {
  const max = maxRatingForScale(scale);
  let weighted = 0;
  let totalWeight = 0;
  for (const attr of attributes) {
    const r = ratings.find((x) => x.attributeId === attr.id);
    if (!r || r.rating === null || r.rating === undefined) continue;
    weighted += (r.rating / max) * attr.weight;
    totalWeight += attr.weight;
  }
  if (totalWeight === 0) return null;
  return Math.round((weighted / totalWeight) * 100);
}

export interface SubmittedScorecard {
  /**
   * Accepted as plain string so callers can pass a DB row directly. Only
   * known recommendation values are tallied; unknown ones are ignored.
   */
  overallRecommendation: string | null | undefined;
  overallScore: number | null | undefined;
}

const KNOWN_RECOMMENDATIONS: ReadonlySet<string> = new Set([
  "strong_yes",
  "yes",
  "no",
  "strong_no",
] satisfies Recommendation[]);

export interface AggregateSnapshot {
  submissionCount: number;
  avgScore: number | null;
  recommendations: Partial<Record<Recommendation, number>>;
}

/**
 * Roll up a set of submitted scorecards into an aggregate snapshot.
 *
 * Used in two places:
 *   • Live debrief view — recomputed each time the recruiter loads it.
 *   • Hiring-decision aggregate — frozen at decision time so the audit
 *     trail captures the state of the world when the call was made.
 */
export function buildAggregateSnapshot(
  submissions: readonly SubmittedScorecard[],
): AggregateSnapshot {
  const recommendations: Partial<Record<Recommendation, number>> = {};
  const scores: number[] = [];
  for (const s of submissions) {
    if (s.overallRecommendation && KNOWN_RECOMMENDATIONS.has(s.overallRecommendation)) {
      const key = s.overallRecommendation as Recommendation;
      recommendations[key] = (recommendations[key] ?? 0) + 1;
    }
    if (s.overallScore !== null && s.overallScore !== undefined) {
      scores.push(s.overallScore);
    }
  }
  const avgScore =
    scores.length === 0
      ? null
      : Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
  return {
    submissionCount: submissions.length,
    avgScore,
    recommendations,
  };
}

export interface AttributeAverage {
  attributeId: string;
  name: string;
  avg: number | null;
  samples: number;
}

export interface NamedAttribute {
  id: string;
  name: string;
}

/**
 * Compute per-attribute averages across all submission ratings.
 * Unrated entries drop out of both numerator and sample count.
 */
export function buildAttributeAverages(
  attributes: readonly NamedAttribute[],
  ratings: readonly AttributeRating[],
): AttributeAverage[] {
  return attributes.map((a) => {
    const rated = ratings.filter(
      (r) => r.attributeId === a.id && r.rating !== null && r.rating !== undefined,
    );
    if (rated.length === 0) {
      return { attributeId: a.id, name: a.name, avg: null, samples: 0 };
    }
    const sum = rated.reduce((acc, r) => acc + (r.rating as number), 0);
    return {
      attributeId: a.id,
      name: a.name,
      avg: Math.round((sum / rated.length) * 10) / 10,
      samples: rated.length,
    };
  });
}
