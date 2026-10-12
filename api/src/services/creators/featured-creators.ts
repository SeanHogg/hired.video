/**
 * Featured-creator ranking read model (#180) — backs /api/featured-creators.
 *
 * Score = wRating·avgRating + wReviews·log10(1+reviews)
 *       + wProjects·log10(1+projects) + wEarnings·log10(1+earned$).
 *
 * The SAME score is pushed into SQL as the ORDER BY (Postgres `log()` is
 * base-10) so the candidate window is the true top-N — previously the
 * query took `limit*3` rows with NO order and ranked that arbitrary subset
 * in JS. `userId` is the deterministic tie-break. JS re-scores the window
 * for the response payload.
 *
 * Cached 300s via the canonical edge cache, but only for the default
 * weights (public surface) — SuperAdmin weight tuning bypasses the cache so
 * arbitrary query params can't fan out unbounded KV keys.
 */

import { and, asc, eq, sql } from "drizzle-orm";
import { getDb, schema } from "../../db/index.js";
import { getOrSetCached } from "../../utils/edge-cache.js";

export interface FeaturedCreator {
  userId: string;
  displayName: string;
  avatarUrl: string | null;
  averageRating: number;
  reviewCount: number;
  completedProjectsCount: number;
  totalEarnedCents: number;
  score: number;
}

export interface FeaturedCreatorWeights {
  rating: number;
  reviews: number;
  projects: number;
  earnings: number;
}

export const DEFAULT_FEATURED_CREATOR_WEIGHTS: FeaturedCreatorWeights = {
  rating: 1.0,
  reviews: 0.5,
  projects: 0.3,
  earnings: 0.2,
};

const FEATURED_CREATORS_TTL_SECONDS = 300;

export function computeFeaturedCreatorScore(input: {
  averageRating: number;
  reviewCount: number;
  completedProjectsCount: number;
  totalEarnedCents: number;
  weights: FeaturedCreatorWeights;
}): number {
  const { weights } = input;
  return (
    weights.rating * input.averageRating +
    weights.reviews * Math.log10(1 + input.reviewCount) +
    weights.projects * Math.log10(1 + input.completedProjectsCount) +
    weights.earnings * Math.log10(1 + input.totalEarnedCents / 100)
  );
}

function isDefaultWeights(w: FeaturedCreatorWeights): boolean {
  const d = DEFAULT_FEATURED_CREATOR_WEIGHTS;
  return w.rating === d.rating && w.reviews === d.reviews && w.projects === d.projects && w.earnings === d.earnings;
}

async function loadFeaturedCreators(
  limit: number,
  category: string | null,
  weights: FeaturedCreatorWeights,
): Promise<FeaturedCreator[]> {
  const { creatorProfiles: cp, users, userProfiles } = schema;
  const conds = [
    eq(cp.isActive, true),
    sql`${cp.endedAt} IS NULL`,
    eq(users.emailVerified, true),
  ];
  if (category) conds.push(sql`${cp.categories} ? ${category}`);

  // SQL mirror of computeFeaturedCreatorScore. Weights are parsed numbers
  // bound as parameters (never raw-interpolated).
  const scoreSql = sql`(
    ${weights.rating}::float8 * COALESCE(${cp.averageRating}, 0)
    + ${weights.reviews}::float8 * log(1 + COALESCE(${cp.ratingCount}, 0))
    + ${weights.projects}::float8 * log(1 + COALESCE(${cp.completedProjectsCount}, 0))
    + ${weights.earnings}::float8 * log(1 + COALESCE(${cp.totalEarnedCents}, 0) / 100.0)
  )`;

  const rows = await getDb()
    .select({
      userId: cp.userId,
      name: users.name,
      avatarUrl: userProfiles.avatarUrl,
      averageRating: cp.averageRating,
      reviewCount: cp.ratingCount,
      completedProjectsCount: cp.completedProjectsCount,
      totalEarnedCents: cp.totalEarnedCents,
    })
    .from(cp)
    .innerJoin(users, eq(cp.userId, users.id))
    .leftJoin(userProfiles, eq(cp.userId, userProfiles.userId))
    .where(and(...conds))
    .orderBy(sql`${scoreSql} DESC`, asc(cp.userId))
    .limit(limit);

  return rows
    .map((r) => {
      const avg = Number(r.averageRating) || 0;
      const reviews = Number(r.reviewCount) || 0;
      const projects = Number(r.completedProjectsCount) || 0;
      const earnings = Number(r.totalEarnedCents) || 0;
      const score = computeFeaturedCreatorScore({
        averageRating: avg,
        reviewCount: reviews,
        completedProjectsCount: projects,
        totalEarnedCents: earnings,
        weights,
      });
      return {
        userId: r.userId,
        displayName: r.name ?? "Creator",
        avatarUrl: r.avatarUrl ?? null,
        averageRating: avg,
        reviewCount: reviews,
        completedProjectsCount: projects,
        totalEarnedCents: earnings,
        score: Number(score.toFixed(4)),
      };
    })
    .sort((a, b) => b.score - a.score || (a.userId < b.userId ? -1 : a.userId > b.userId ? 1 : 0));
}

/** Top-N featured creators, optionally filtered to a program category. */
export function getFeaturedCreators(opts: {
  limit: number;
  category: string | null;
  weights: FeaturedCreatorWeights;
}): Promise<FeaturedCreator[]> {
  const { limit, category, weights } = opts;
  if (!isDefaultWeights(weights)) return loadFeaturedCreators(limit, category, weights);
  return getOrSetCached({
    key: `featured-creators:v1:${limit}:${category ?? ""}`,
    ttlSeconds: FEATURED_CREATORS_TTL_SECONDS,
    loader: () => loadFeaturedCreators(limit, category, weights),
  });
}
