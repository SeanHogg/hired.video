/**
 * Career 360 cache-key builders — a leaf module so BOTH the producer
 * ([Career360Service](./Career360Service.ts), which read-through caches the
 * inner-ring funnel) and the cross-track INVALIDATORS (the jobs domain, whose
 * saved-job status + apply mutations change the funnel — #2129b) reference ONE
 * key format and can never drift. No service imports here, so it's safe to pull
 * from any track without a cycle.
 */

/** Read-through key for a user's Career 360 inner-ring funnel aggregate.
 *  Isolate-local cache (utils/isolate-cache.ts) — invalidate with
 *  `invalidateIsolateKey`. */
export function c360FunnelCacheKey(userId: string): string {
  return `c360:funnel:${userId}`;
}
