import type { Context, MiddlewareHandler } from "hono";
import { jwtVerify } from "jose";
import { getJwtSecretOptional } from "../utils/jwt.js";
import { error } from "../types/index.js";

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

// Cap the rate-limit table size to prevent unbounded growth on long-lived
// Workers isolates under sustained traffic from many unique IPs (gap #1339).
const MAX_ENTRIES = 10_000;

/**
 * Bounded LRU rate-limit table.
 *
 * Uses JS Map's insertion-order guarantee to maintain LRU semantics:
 *   - `set()` / `touch()` re-insert the key so it lands at the tail
 *   - on overflow we delete from the head (`map.keys().next().value`)
 *
 * The first-pass implementation (gap #1339) was a `Map` with a lazy
 * `sweepExpired()` at MAX_ENTRIES — which collapsed in the worst case
 * where the cap was reached inside a single live window (every entry
 * still valid, sweep finds nothing, the Map keeps growing). LRU eviction
 * fixes that: when no expired entry exists we always evict the
 * least-recently-touched one, guaranteeing the table never exceeds
 * MAX_ENTRIES regardless of traffic pattern.
 *
 * Per-bucket eviction means a flood from many unique IPs evicts older
 * entries before they'd legitimately tick over — which is the correct
 * trade-off for a rate limiter: misbehaving traffic that fills the
 * table CAN cause well-behaved buckets to be forgotten, but the
 * misbehaving traffic itself is still throttled because its OWN bucket
 * stays at the tail.
 */
class BoundedLruRateLimitMap {
  private readonly map = new Map<string, RateLimitEntry>();
  constructor(private readonly capacity: number = MAX_ENTRIES) {}

  /** Read with touch — moves the entry to the LRU tail so it survives
   *  longer. Returns undefined if absent. */
  get(key: string): RateLimitEntry | undefined {
    const entry = this.map.get(key);
    if (entry === undefined) return undefined;
    // Touch: re-insert so this key becomes most-recently-used.
    this.map.delete(key);
    this.map.set(key, entry);
    return entry;
  }

  /** Insert / replace. When capacity is exceeded we first try to drop
   *  any single expired entry (cheap O(N) scan, but only walks until it
   *  finds one); if no expired entry exists we fall back to evicting
   *  the LRU head. Both paths guarantee `size <= capacity` post-set. */
  set(key: string, entry: RateLimitEntry, now: number): void {
    // If we're replacing in place there's no growth, so skip eviction.
    if (this.map.has(key)) {
      this.map.delete(key);
      this.map.set(key, entry);
      return;
    }
    if (this.map.size >= this.capacity) {
      // Prefer evicting an expired entry over a live one — single pass,
      // bail on first hit. Walks insertion-order (LRU-first) so even
      // when nothing's expired, we'd evict the LRU anyway on the next step.
      let evicted = false;
      for (const [k, v] of this.map) {
        if (now > v.resetAt) {
          this.map.delete(k);
          evicted = true;
          break;
        }
      }
      // Nothing expired — evict LRU head.
      if (!evicted) {
        const oldest = this.map.keys().next();
        if (!oldest.done) this.map.delete(oldest.value);
      }
    }
    this.map.set(key, entry);
  }

  /** Increment the existing entry's count in place. Also touches the
   *  LRU position so frequently-accessed entries stay resident. */
  increment(key: string, entry: RateLimitEntry): void {
    entry.count += 1;
    // Touch so this key moves to the tail.
    this.map.delete(key);
    this.map.set(key, entry);
  }

  get size(): number {
    return this.map.size;
  }
}
// Sliding window for every bucket. 60 s matches the per-route copy that
// used to live in this file before the unified bucket refactor.
const WINDOW_MS = 60_000;
// Per-IP cap for anonymous traffic — kept tight because anon endpoints
// (signup gate, public listings, etc.) are abuse-prone and a shared NAT
// of real users shouldn't be hitting these in bulk.
const ANON_MAX_REQUESTS = 100;
// Per-user cap for authenticated traffic. Authenticated editors (Studio
// autosave, asset fetches, AI chat, etc.) easily burn through the anon
// cap in a normal session. Keying by user instead of IP also fixes the
// shared-office-IP false-positive where multiple real users coming from
// one NAT collide in the same bucket.
const USER_MAX_REQUESTS = 600;

/** Resolve the caller's IP from common proxy headers. CF-Connecting-IP
 *  takes precedence (single, trusted value at the Cloudflare edge);
 *  otherwise we fall back to the first hop in X-Forwarded-For.
 *
 *  Exported so adjacent surfaces (routes/errors.ts, routes/extension.ts,
 *  any future client-side ingest endpoint) can use ONE source of truth
 *  instead of each defining their own parallel copy. */
export function getClientIp(c: Context): string {
  const cf = c.req.header("CF-Connecting-IP");
  if (cf) return cf.trim();
  const xff = c.req.header("x-forwarded-for");
  if (xff) {
    const first = xff.split(",")[0]?.trim();
    if (first) return first;
  }
  return "unknown";
}

/**
 * Factory for per-IP, fixed-window rate-limit middlewares.
 *
 * Use when you want a tight cap on an unauthenticated endpoint that
 * doesn't fit the global limiter's anon/user-bucket model — typically
 * a client-side ingest (errors, extension telemetry) or a per-action
 * abuse cap (register, password reset, …).
 *
 * Replaces four ad-hoc copies of `Map<ip,{count,resetAt}>` + 429-with-
 * Retry-After that lived in errors.ts, extension.ts, and the two
 * specialised auth limiters below. Each caller passes its own
 * `windowMs`, `maxAttempts`, and a custom 429 `message` for telemetry.
 *
 * Note: every call returns a NEW middleware with its OWN bucket Map.
 * Two limiters never share state — share-state-by-accident was the
 * original reason these were inlined rather than factored.
 */
export interface IpRateLimiterOptions {
  windowMs: number;
  maxAttempts: number;
  /** Message shown in the 429 response body. */
  message: string;
  /** Override the key function — defaults to per-IP. */
  keyOf?: (c: Context) => string;
}

export function createIpRateLimiter(opts: IpRateLimiterOptions): MiddlewareHandler {
  const bucket = new BoundedLruRateLimitMap();
  const keyOf = opts.keyOf ?? ((c) => getClientIp(c));
  return async (c, next) => {
    const key = keyOf(c);
    const now = Date.now();
    const entry = bucket.get(key);
    if (!entry || now > entry.resetAt) {
      bucket.set(key, { count: 1, resetAt: now + opts.windowMs }, now);
      return next();
    }
    bucket.increment(key, entry);
    if (entry.count > opts.maxAttempts) {
      const retryAfter = Math.ceil((entry.resetAt - now) / 1000);
      c.res.headers.set("Retry-After", String(retryAfter));
      return c.json(
        error("TOO_MANY_REQUESTS", opts.message),
        429,
      );
    }
    return next();
  };
}

/**
 * Resolve the bucket key + cap for this request.
 *
 * If the Authorization header carries a valid Bearer JWT we key off the
 * verified `sub` so each authenticated user gets their own bucket at the
 * higher USER cap. Verification (not just decoding) is intentional —
 * otherwise a bot could rotate forged subs to spread its requests across
 * many buckets and bypass the limit.
 *
 * The emulation token (X-Emulation-Token) is deliberately ignored here:
 * a SuperAdmin's request volume should bill against their own bucket, not
 * the user they happen to be impersonating.
 */
async function resolveBucket(c: Context): Promise<{ key: string; cap: number }> {
  const rawSecret = getJwtSecretOptional();
  if (rawSecret) {
    const authHeader = c.req.header("Authorization");
    if (authHeader?.startsWith("Bearer ")) {
      try {
        const secretKey = new TextEncoder().encode(rawSecret);
        const { payload } = await jwtVerify(authHeader.slice(7), secretKey, {
          algorithms: ["HS256"],
        });
        const sub = payload.sub;
        if (typeof sub === "string" && sub.length > 0) {
          return { key: `user:${sub}`, cap: USER_MAX_REQUESTS };
        }
      } catch {
        // Invalid/expired token — fall through to IP-based bucket.
      }
    }
  }
  return { key: `ip:${getClientIp(c)}`, cap: ANON_MAX_REQUESTS };
}

const store = new BoundedLruRateLimitMap();

export const rateLimiterMiddleware: MiddlewareHandler = async (c, next) => {
  const { key, cap } = await resolveBucket(c);
  const now = Date.now();
  const entry = store.get(key);

  if (!entry || now > entry.resetAt) {
    store.set(key, { count: 1, resetAt: now + WINDOW_MS }, now);
    return next();
  }

  store.increment(key, entry);

  if (entry.count > cap) {
    const retryAfter = Math.ceil((entry.resetAt - now) / 1000);
    c.res.headers.set("Retry-After", String(retryAfter));
    return c.json(
      error("TOO_MANY_REQUESTS", "Rate limit exceeded. Please try again later."),
      429,
    );
  }

  return next();
};

// ---------------------------------------------------------------------------
// Per-endpoint limiters via the shared factory above.
//
//   register     — 5/h. /register is a known spam vector; the global limiter
//                  exempts /api/auth/* (login bursts during recovery), so this
//                  is the abuse cap.
//   auth-write   — 20/10min. Covers /login, /magic-link, /forgot-password,
//                  /reset-password. Per-IP rather than per-email so it
//                  catches credential-stuffing bots walking many emails from
//                  one origin. Defence-in-depth alongside Turnstile (#425).
// ---------------------------------------------------------------------------

export const registerRateLimiterMiddleware: MiddlewareHandler = createIpRateLimiter({
  windowMs: 60 * 60 * 1000,
  maxAttempts: 5,
  message: "Too many signup attempts from this network. Please try again later.",
});

export const authWriteRateLimiterMiddleware: MiddlewareHandler = createIpRateLimiter({
  windowMs: 10 * 60 * 1000,
  maxAttempts: 20,
  message: "Too many auth attempts from this network. Please try again later.",
});
