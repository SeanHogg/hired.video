/**
 * Per-user cache for `GamificationService.getUserSummary` — the points
 * widget payload (`/api/points/me`, `/api/bootstrap`, the learner
 * dashboard). It was six parallel queries per read, one of them the whole
 * badge catalog; the catalog now comes from the long-lived public catalog
 * cache (badge-catalog.ts) and the per-user summary from here.
 *
 * Every write that moves a user's balance / streak / badges / suspension
 * goes through GamificationService, which calls
 * `invalidatePointsSummary(userId)`; the TTL bounds anything else (other
 * isolates, the nightly fraud sweep's auto-suspensions).
 */
import { getOrSetIsolateCached, invalidateIsolateKey } from "../../utils/isolate-cache.js";

/** Isolate-local (no KV writes — Workers Free); invalidation reaches only
 *  the writing isolate, so other isolates converge within this TTL. */
export const POINTS_SUMMARY_TTL_SECONDS = 120;

const summaryKey = (userId: string) => `points:summary:v1:${userId}`;

export function getCachedPointsSummary<T>(userId: string, loader: () => Promise<T>): Promise<T> {
  return getOrSetIsolateCached({ key: summaryKey(userId), ttlSeconds: POINTS_SUMMARY_TTL_SECONDS, loader });
}

export function invalidatePointsSummary(userId: string | null | undefined): void {
  if (userId) invalidateIsolateKey(summaryKey(userId));
}
