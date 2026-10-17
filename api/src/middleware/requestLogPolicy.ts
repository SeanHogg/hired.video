/**
 * Which requests become a request_logs row, and with what weight.
 *
 * request_logs used to take one INSERT per request — a Neon round-trip on
 * every API call, crawlers and analytics beacons included. The table only
 * has to answer "is this route live on the latest release, how much is it
 * used, and where does it fail?" (ObservabilityRepository), so:
 *
 *   - never logged: preflights / HEAD probes, health checks, crawler and
 *     beacon traffic (OG cards, sitemaps, embed runtime, usage/analytics
 *     beacons), and self-identified bots;
 *   - always logged (weight 1): every non-GET, every 4xx/5xx, every slow
 *     request, and the first request a signed-in user makes in this isolate
 *     each UTC day (keeps DAU/WAU/MAU, which count DISTINCT user_id, honest);
 *   - everything else (fast, successful GETs) is sampled 1 in
 *     SUCCESS_GET_SAMPLE_RATE and written with that weight, so weighted
 *     aggregates stay unbiased.
 *
 * Pure apart from the bounded isolate-local "seen today" set; the random
 * source is injectable for tests.
 */

/** 1 in N fast successful GETs is written (with sample_weight = N). */
export const SUCCESS_GET_SAMPLE_RATE = 10;
/** Requests at least this slow are always written. */
export const SLOW_REQUEST_MS = 1_000;

const SKIPPED_METHODS = new Set(["OPTIONS", "HEAD"]);
const SKIPPED_EXACT_PATHS = new Set([
  "/health",
  "/api/health",
  "/sitemap.xml",
  "/robots.txt",
  "/api/usage/track",
  "/api/analytics/beacon",
  "/api/analytics/artifacts/beacon",
  "/api/analytics/ads/impression",
]);
/** Crawler-, embed- and pixel-serving prefixes. */
const SKIPPED_PREFIXES = ["/api/og/", "/embed/", "/api/embed/", "/sitemap", "/api/campaigns/open"];
const BOT_UA = /bot\b|bot\/|crawl|spider|slurp|facebookexternalhit|embedly|preview|headless|lighthouse|pingdom|uptime|monitor/i;

export interface RequestLogInput {
  method: string;
  /** Raw URL pathname. */
  path: string;
  status: number;
  durationMs: number;
  userAgent?: string | null;
  userId?: string | null;
}

export type RequestLogDecision = { log: false } | { log: true; weight: number };

const _userSeenDay = new Map<string, string>();
const USER_SEEN_MAX_ENTRIES = 20_000;

/** True the first time this isolate sees `userId` on `day`. */
function firstSightingToday(userId: string, day: string): boolean {
  if (_userSeenDay.get(userId) === day) return false;
  if (_userSeenDay.size >= USER_SEEN_MAX_ENTRIES) _userSeenDay.clear();
  _userSeenDay.set(userId, day);
  return true;
}

export function isUnloggedRequest(method: string, path: string, userAgent?: string | null): boolean {
  if (SKIPPED_METHODS.has(method)) return true;
  if (SKIPPED_EXACT_PATHS.has(path)) return true;
  if (SKIPPED_PREFIXES.some((p) => path.startsWith(p))) return true;
  return !!userAgent && BOT_UA.test(userAgent);
}

export function decideRequestLog(
  input: RequestLogInput,
  random: () => number = Math.random,
  now: Date = new Date(),
): RequestLogDecision {
  if (isUnloggedRequest(input.method, input.path, input.userAgent)) return { log: false };
  if (input.method !== "GET" || input.status >= 400 || input.durationMs >= SLOW_REQUEST_MS) {
    return { log: true, weight: 1 };
  }
  if (input.userId && firstSightingToday(input.userId, now.toISOString().slice(0, 10))) {
    return { log: true, weight: 1 };
  }
  return random() * SUCCESS_GET_SAMPLE_RATE < 1
    ? { log: true, weight: SUCCESS_GET_SAMPLE_RATE }
    : { log: false };
}

/** Test-only: forget the per-isolate "seen today" set. */
export function __resetRequestLogPolicyForTests(): void {
  _userSeenDay.clear();
}
