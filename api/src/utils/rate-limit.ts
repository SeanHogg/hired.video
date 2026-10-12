/**
 * Best-effort per-dimension rate limiter (#1828) — a fixed-window counter
 * backed by the shared Workers KV binding. KV is eventually consistent, so
 * this is a SOFT throttle for abuse mitigation on read-only / unauthenticated
 * surfaces (e.g. the public embed data API), NOT a hard quota: under burst
 * concurrency a few extra requests can slip through a window boundary. When KV
 * is unbound (dev / tests) it no-ops (always allows), so it never blocks local
 * work.
 *
 * Fixed-window (not sliding) for cost: one KV read + one write per request,
 * keyed by `floor(now / window)`. The counter key self-expires after the
 * window via `expirationTtl`, so there's no sweep.
 */
import { getKvNamespace } from "./edge-cache.js";

export interface RateLimitResult {
  allowed: boolean;
  limit: number;
  /** Requests left in the current window (0 when blocked). */
  remaining: number;
  /** Seconds until the window resets — surface as `Retry-After` on a 429. */
  retryAfterSeconds: number;
}

/**
 * Count one hit against `dimension` and report whether it's within `limit` per
 * `windowSeconds`. `dimension` should identify the throttled subject (e.g.
 * `embed:<keyPrefix>:<view>`).
 */
export async function checkRateLimit(
  dimension: string,
  limit: number,
  windowSeconds: number,
): Promise<RateLimitResult> {
  const kv = getKvNamespace();
  if (!kv) return { allowed: true, limit, remaining: limit, retryAfterSeconds: 0 };

  const nowSec = Math.floor(Date.now() / 1000);
  const windowIndex = Math.floor(nowSec / windowSeconds);
  const key = `ratelimit:${dimension}:${windowIndex}`;
  const resetIn = windowSeconds - (nowSec % windowSeconds);

  const current = Number((await kv.get(key).catch(() => null)) ?? 0);
  if (current >= limit) {
    return { allowed: false, limit, remaining: 0, retryAfterSeconds: resetIn };
  }
  // Fire-and-forget the increment — a lost write under a race only UNDER-counts
  // (fails open), which is the safe direction for a soft throttle. TTL is the
  // window + a small grace so the key is gone well before it could be reused.
  await kv
    .put(key, String(current + 1), { expirationTtl: windowSeconds + 5 })
    .catch(() => undefined);
  return { allowed: true, limit, remaining: limit - current - 1, retryAfterSeconds: resetIn };
}
