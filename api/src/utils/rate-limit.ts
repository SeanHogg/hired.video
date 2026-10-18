/**
 * Best-effort per-dimension rate limiter (#1828) — a fixed-window counter
 * held in THIS isolate's memory. It is a SOFT throttle for abuse mitigation
 * on read-only / unauthenticated surfaces (e.g. the public embed data API),
 * NOT a hard quota: each warm isolate counts on its own, so a caller spread
 * across N isolates can get up to N × `limit` per window.
 *
 * Why not KV: a KV-backed counter costs one KV WRITE per request, and the
 * account runs on Workers Free (~1,000 KV writes/day) whose write budget is
 * reserved for the scheduler's work markers (services/scheduling/
 * work-signals.ts) — a busy embed would exhaust it and keep Neon awake.
 * A hammering client almost always lands on the same warm isolate, which
 * is exactly the case this throttle exists for.
 */

export interface RateLimitResult {
  allowed: boolean;
  limit: number;
  /** Requests left in the current window (0 when blocked). */
  remaining: number;
  /** Seconds until the window resets — surface as `Retry-After` on a 429. */
  retryAfterSeconds: number;
}

/** Bound on tracked windows per isolate (oldest evicted past this). */
const MAX_WINDOWS = 5_000;

const _windows = new Map<string, { count: number; expiresAt: number }>();

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
  const nowMs = Date.now();
  const nowSec = Math.floor(nowMs / 1000);
  const windowIndex = Math.floor(nowSec / windowSeconds);
  const key = `${dimension}:${windowIndex}`;
  const resetIn = windowSeconds - (nowSec % windowSeconds);

  let entry = _windows.get(key);
  if (entry && entry.expiresAt <= nowMs) {
    _windows.delete(key);
    entry = undefined;
  }
  if (!entry) {
    if (_windows.size >= MAX_WINDOWS) {
      const oldest = _windows.keys().next();
      if (!oldest.done) _windows.delete(oldest.value);
    }
    entry = { count: 0, expiresAt: nowMs + resetIn * 1000 };
    _windows.set(key, entry);
  }
  if (entry.count >= limit) {
    return { allowed: false, limit, remaining: 0, retryAfterSeconds: resetIn };
  }
  entry.count += 1;
  return { allowed: true, limit, remaining: limit - entry.count, retryAfterSeconds: resetIn };
}

/** Test-only: forget every window so cases don't leak state. */
export function __resetRateLimitForTests(): void {
  _windows.clear();
}
