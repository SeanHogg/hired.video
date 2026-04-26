/**
 * Job ranking — pure scoring rules for the discovery feed.
 *
 * This is the home for the priority-job-matching domain rules advertised
 * on `Pricing.tsx` and tracked as gap #204. The route handler in
 * `routes/discovery.ts` reads the candidate set from Postgres + the
 * caller's subscription tier, then delegates ranking to `scoreJobsForRanking`.
 *
 * Pure function — takes wall-clock `now` so tests can pin time, returns a
 * new array sorted by descending `_score`. No DB, no IO. Lives outside
 * the route file because the weights are first-class domain concepts that
 * marketing copy has already promised to users; collocating them with the
 * billing tier rules makes future audits ("does our 'Priority matching'
 * still actually re-order?") tractable.
 */

/**
 * Scoring weights. Adjusting these changes the user-visible ordering of
 * the discovery feed for both Free and Pro tiers, so any change should
 * be paired with the regression tests in
 * `routes/__tests__/pricing-gates.test.ts`.
 */
export const RANKING_WEIGHTS = {
  /** Each query term that appears anywhere in title+description. */
  termInBody: 10,
  /** PRO ONLY: each query term that appears in the title (~3× body weight). */
  termInTitlePro: 20,
  /** Base bump applied to sponsored job rows on top of any per-row boost. */
  sponsoredBase: 20,
  /** PRO ONLY: small extra bump so paid placements stay visible without
   *  drowning out high-relevance organic matches. */
  sponsoredBoostPro: 5,
  /** PRO ONLY: jobs created within this many days get the "fresh" boost. */
  recencyFreshDays: 7,
  /** PRO ONLY: jobs created within this many days get the "recent" boost. */
  recencyRecentDays: 30,
  /** PRO ONLY: boost added when ageMs ≤ recencyFreshDays. */
  recencyFreshBoost: 15,
  /** PRO ONLY: boost added when fresh window missed but ≤ recencyRecentDays. */
  recencyRecentBoost: 5,
} as const;

const DAY_MS = 24 * 3600_000;

export interface ScoreableJob {
  id?: string;
  title?: string | null;
  description?: string | null;
  createdAt?: Date | string | null;
  sponsored?: boolean | null;
  sponsoredRankBoost?: number | null;
  [key: string]: unknown;
}

/**
 * Score and sort a set of candidate jobs.
 *
 * Free users see only the base relevance score (per-term match × `termInBody`)
 * plus the sponsored bump. Pro users get the priority-matching boost
 * advertised on the Pricing page: title-overlap multiplier, recency
 * tiebreakers, and a sponsored amplifier.
 *
 * Returns a new array (does not mutate) sorted by descending `_score`.
 * The `_score` field is exposed for tests; production callers should strip
 * it before serializing the response.
 */
export function scoreJobsForRanking<T extends ScoreableJob>(
  jobs: T[],
  query: string,
  isPremium: boolean,
  now: number = Date.now(),
): Array<T & { _score: number }> {
  const terms = query ? query.toLowerCase().split(/\s+/).filter(Boolean) : [];
  return jobs
    .map((j) => ({ ...j, _score: scoreSingleJob(j, terms, isPremium, now) }))
    .sort((a, b) => b._score - a._score);
}

function scoreSingleJob(
  job: ScoreableJob,
  terms: string[],
  isPremium: boolean,
  now: number,
): number {
  const W = RANKING_WEIGHTS;
  const text = `${job.title ?? ""} ${job.description ?? ""}`.toLowerCase();
  const titleText = String(job.title ?? "").toLowerCase();

  const baseQScore = terms.reduce((s, t) => s + (text.includes(t) ? W.termInBody : 0), 0);
  const sponsoredBase = job.sponsored ? W.sponsoredBase + (Number(job.sponsoredRankBoost) || 0) : 0;
  if (!isPremium) return baseQScore + sponsoredBase;

  let proBoost = terms.reduce((s, t) => s + (titleText.includes(t) ? W.termInTitlePro : 0), 0);

  const ageMs = job.createdAt ? now - new Date(job.createdAt).getTime() : Infinity;
  if (ageMs <= W.recencyFreshDays * DAY_MS) proBoost += W.recencyFreshBoost;
  else if (ageMs <= W.recencyRecentDays * DAY_MS) proBoost += W.recencyRecentBoost;

  if (job.sponsored) proBoost += W.sponsoredBoostPro;

  return baseQScore + sponsoredBase + proBoost;
}
