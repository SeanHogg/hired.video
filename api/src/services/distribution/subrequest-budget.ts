/**
 * Subrequest budgets for the distribution cron steps (#2047 / #2048) — the
 * ONE place their limits and per-item cost estimates live.
 *
 * Workers Free allows 50 subrequests per cron invocation, shared by every
 * sweep in scheduled.ts (each DB query over the Neon HTTP driver is one;
 * each network call is one). So each step gets a slice and estimates what
 * an item costs BEFORE taking it on:
 *
 *   publish jobs   claimed one at a time; the next claim only considers
 *                  destinations whose estimated cost still fits, so a run
 *                  stops before it would overrun and the rest wait a tick.
 *                  The first claim of a run always fits (every cost ≤ the
 *                  budget), so no destination can starve.
 *   metrics sync   each (poster, network) group's read is costed by how
 *                  many stats calls its posts need; a group that doesn't fit
 *                  waits (its posts have no snapshot today, so the next run
 *                  picks them up).
 *
 * Estimates are typical-high, not worst case: a network that polls
 * (Instagram's container status, X's media processing, TikTok's publish
 * status) is costed for several polls; a slow one can still poll longer.
 */
import type { DistributionDestination, DistributionLane } from "../../../../shared/social-publish-jobs.js";
import type { VideoPublishPlatform } from "../../../../shared/social-platforms.js";

/** The publish drainer's slice of the 50 per invocation. */
export const PUBLISH_SUBREQUEST_BUDGET = 30;
/** The metrics sync's slice (it runs on the half tick, beside the scraper). */
export const METRICS_SUBREQUEST_BUDGET = 10;
/** The posting-agent planner's slice (quarter ticks that aren't half ticks). */
export const AGENT_SUBREQUEST_BUDGET = 12;
/** A webhook delivery's refresh runs in its own request (waitUntil). */
export const WEBHOOK_METRICS_SUBREQUEST_BUDGET = 20;

/** Never more than this many jobs per run, whatever the budget. */
export const PUBLISH_JOBS_PER_RUN = 3;

/** Each claim is one UPDATE. */
export const CLAIM_COST = 1;

/**
 * DB work every Lane-B send does around the network calls: the idempotency
 * check, project + cut + video reads, the plan's channel cap (plan +
 * publications), the connection token (read, maybe refresh), the
 * publication upsert and marking the job done.
 */
const SELF_OVERHEAD = 9;

/** Network calls one post makes, per network. */
const NETWORK_CALLS: Record<VideoPublishPlatform, number> = {
  youtube: 2, //   fetch the MP4 + one multipart upload
  tiktok: 8, //    init + upload + status polls
  instagram: 14, // account + container + ~10 status polls + publish
  x: 12, //        fetch + init + segments + finalize + status polls + post
  facebook: 2, //  Page lookup + file_url upload
  linkedin: 6, //  identity + init + upload part(s) + finalize + post
};

/** A Lane-A submit: project + video + lane-ready + screening (LLM) + insert + done. */
const MANAGED_COST = 7;
/** A feed cross-post: project + video + insert + done. */
const FEED_COST = 4;

/** Estimated subrequests to send one job (excluding its claim). */
export function publishJobCost(destination: DistributionDestination, lane: DistributionLane): number {
  if (destination === "feed") return FEED_COST;
  if (lane === "managed") return MANAGED_COST;
  return SELF_OVERHEAD + NETWORK_CALLS[destination];
}

/** The (destination, lane) kinds whose send fits in `remaining` (claim included). */
export function affordableJobKinds(
  kinds: ReadonlyArray<{ destination: DistributionDestination; lane: DistributionLane }>,
  remaining: number,
): Array<{ destination: DistributionDestination; lane: DistributionLane }> {
  return kinds.filter((k) => CLAIM_COST + publishJobCost(k.destination, k.lane) <= remaining);
}

// ─── Metrics reads ───────────────────────────────────────────────────────────

/** Posts one stats call answers, per network (LinkedIn: one call per post). */
const METRICS_BATCH: Record<VideoPublishPlatform, number> = {
  youtube: 50,
  tiktok: 20,
  instagram: 50,
  x: 100,
  facebook: 50,
  linkedin: 1,
};
/** Facebook first looks up the Page token. */
const METRICS_EXTRA: Partial<Record<VideoPublishPlatform, number>> = { facebook: 1 };
/** The poster's token: a read, maybe a refresh. */
const TOKEN_COST = 2;
/** The run's own DB work: the due list and the one snapshot upsert. */
export const METRICS_FIXED_COST = 2;

/** Estimated subrequests to read `posts` posts of one (poster, network) group. */
export function metricsGroupCost(platform: VideoPublishPlatform, posts: number): number {
  if (posts <= 0) return 0;
  return TOKEN_COST + (METRICS_EXTRA[platform] ?? 0) + Math.ceil(posts / METRICS_BATCH[platform]);
}

/** How many of a group's `posts` fit in `remaining` (0 = none). */
export function metricsPostsThatFit(platform: VideoPublishPlatform, posts: number, remaining: number): number {
  let n = posts;
  while (n > 0 && metricsGroupCost(platform, n) > remaining) n--;
  return n;
}
