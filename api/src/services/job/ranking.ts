/**
 * Job ranking — pure scoring rules for the discovery feed.
 *
 * This is the home for the priority-job-matching domain rules advertised
 * on `Pricing.tsx` and tracked as gap #204. The route handler in
 * `routes/discovery.ts` reads the candidate set from Postgres + the
 * caller's subscription tier, then delegates ranking to `scoreJobsForRanking`.
 *
 * Architecture: strategy pattern. `RANKING_RULES` is a list of
 * `ScoringRule` objects, each contributing an additive score for one
 * named factor (term-in-body, sponsored, recency, etc.). Adding a new
 * factor is a one-line append to that list — no edit to the scoring
 * function itself. Tests hit each rule individually and the composed
 * scorer end-to-end.
 *
 * Pure module — no DB, no IO. `now` is injected so tests can pin time.
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

/** All inputs available to a single scoring rule. Pinned `now` so tests
 *  drive the recency window deterministically. */
export interface ScoringContext {
  job: ScoreableJob;
  terms: string[];
  isPro: boolean;
  now: number;
}

/** A single named scoring factor. `score` returns the additive contribution
 *  to the job's final score (0 when the rule does not apply). */
export interface ScoringRule {
  /** Stable identifier — used for per-rule debug logging. */
  readonly name: string;
  /** Whether this rule fires for Free, Pro, or both. Drives skip-checks
   *  and documentation. */
  readonly tier: "free" | "pro" | "both";
  score(ctx: ScoringContext): number;
}

// ---------------------------------------------------------------------------
// Individual rules — exported so tests assert each in isolation.
// ---------------------------------------------------------------------------

export const termInBodyRule: ScoringRule = {
  name: "term-in-body",
  tier: "both",
  score: ({ job, terms }) => {
    const text = `${job.title ?? ""} ${job.description ?? ""}`.toLowerCase();
    return terms.reduce((s, t) => s + (text.includes(t) ? RANKING_WEIGHTS.termInBody : 0), 0);
  },
};

export const sponsoredBaseRule: ScoringRule = {
  name: "sponsored-base",
  tier: "both",
  score: ({ job }) =>
    job.sponsored ? RANKING_WEIGHTS.sponsoredBase + (Number(job.sponsoredRankBoost) || 0) : 0,
};

export const termInTitleProRule: ScoringRule = {
  name: "term-in-title-pro",
  tier: "pro",
  score: ({ job, terms, isPro }) => {
    if (!isPro) return 0;
    const titleText = String(job.title ?? "").toLowerCase();
    return terms.reduce((s, t) => s + (titleText.includes(t) ? RANKING_WEIGHTS.termInTitlePro : 0), 0);
  },
};

export const recencyProRule: ScoringRule = {
  name: "recency-pro",
  tier: "pro",
  score: ({ job, isPro, now }) => {
    if (!isPro) return 0;
    const ageMs = job.createdAt ? now - new Date(job.createdAt).getTime() : Infinity;
    if (ageMs <= RANKING_WEIGHTS.recencyFreshDays * DAY_MS) return RANKING_WEIGHTS.recencyFreshBoost;
    if (ageMs <= RANKING_WEIGHTS.recencyRecentDays * DAY_MS) return RANKING_WEIGHTS.recencyRecentBoost;
    return 0;
  },
};

export const sponsoredProBoostRule: ScoringRule = {
  name: "sponsored-pro-boost",
  tier: "pro",
  score: ({ job, isPro }) => (isPro && job.sponsored ? RANKING_WEIGHTS.sponsoredBoostPro : 0),
};

/** Default ruleset applied by `scoreJobsForRanking`. New rules go here. */
export const RANKING_RULES: readonly ScoringRule[] = [
  termInBodyRule,
  sponsoredBaseRule,
  termInTitleProRule,
  recencyProRule,
  sponsoredProBoostRule,
];

// ---------------------------------------------------------------------------
// Scorer — composes the rules and returns a sorted copy of the input.
// ---------------------------------------------------------------------------

/**
 * Score and sort a set of candidate jobs.
 *
 * Rules in `RANKING_RULES` are applied additively. Free users see only
 * the rules with `tier === "free" | "both"` contributing non-zero;
 * Pro users see all of them. Returns a new array (does not mutate)
 * sorted by descending `_score`.
 *
 * The `_score` field is exposed for tests; production callers should
 * strip it before serializing the response.
 */
export function scoreJobsForRanking<T extends ScoreableJob>(
  jobs: T[],
  query: string,
  isPro: boolean,
  now: number = Date.now(),
  rules: readonly ScoringRule[] = RANKING_RULES,
): Array<T & { _score: number }> {
  const terms = query ? query.toLowerCase().split(/\s+/).filter(Boolean) : [];
  return jobs
    .map((job) => {
      const ctx: ScoringContext = { job, terms, isPro, now };
      const _score = rules.reduce((sum, rule) => sum + rule.score(ctx), 0);
      return { ...job, _score };
    })
    .sort((a, b) => b._score - a._score);
}
