import type { Context, MiddlewareHandler } from "hono";
import { jwtVerify } from "jose";
import { getJwtSecretOptional } from "../utils/jwt.js";

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const store = new Map<string, RateLimitEntry>();
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
 *  otherwise we fall back to the first hop in X-Forwarded-For. */
function getClientIp(c: Context): string {
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

export const rateLimiterMiddleware: MiddlewareHandler = async (c, next) => {
  const { key, cap } = await resolveBucket(c);
  const now = Date.now();
  const entry = store.get(key);

  if (!entry || now > entry.resetAt) {
    store.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return next();
  }

  entry.count += 1;

  if (entry.count > cap) {
    const retryAfter = Math.ceil((entry.resetAt - now) / 1000);
    c.res.headers.set("Retry-After", String(retryAfter));
    return c.json(
      { error: { code: "TOO_MANY_REQUESTS", message: "Rate limit exceeded. Please try again later." } },
      429,
    );
  }

  return next();
};

// ---------------------------------------------------------------------------
// Register endpoint limiter — separate, much tighter window. The global
// limiter exempts /api/auth/* (legitimate users hammer login during sign-in
// flows), but /register is a known spam vector and deserves its own gate.
// 5 attempts per hour per IP is enough headroom for "I mistyped my email
// and need to retry" without leaving the door open to bulk signup.
// ---------------------------------------------------------------------------

const registerStore = new Map<string, RateLimitEntry>();
const REGISTER_WINDOW_MS = 60 * 60 * 1000; // 1 hour
const REGISTER_MAX_ATTEMPTS = 5;

export const registerRateLimiterMiddleware: MiddlewareHandler = async (c, next) => {
  const ip = getClientIp(c);
  const now = Date.now();
  const entry = registerStore.get(ip);

  if (!entry || now > entry.resetAt) {
    registerStore.set(ip, { count: 1, resetAt: now + REGISTER_WINDOW_MS });
    return next();
  }

  entry.count += 1;

  if (entry.count > REGISTER_MAX_ATTEMPTS) {
    const retryAfter = Math.ceil((entry.resetAt - now) / 1000);
    c.res.headers.set("Retry-After", String(retryAfter));
    return c.json(
      {
        error: {
          code: "TOO_MANY_REQUESTS",
          message: "Too many signup attempts from this network. Please try again later.",
        },
      },
      429,
    );
  }

  return next();
};

// ---------------------------------------------------------------------------
// Auth-write endpoint limiter (#427) — covers /login, /magic-link,
// /forgot-password, /reset-password. Per-IP rather than per-email so it
// catches credential-stuffing bots that walk many emails from one origin.
// Window + cap deliberately looser than /register since legitimate users
// can fire 4-5 attempts on the same form during a mistyped-password
// recovery. Defense-in-depth alongside #425's Turnstile gate (which the
// FE may fail to mount on script-load drift).
// ---------------------------------------------------------------------------

const authWriteStore = new Map<string, RateLimitEntry>();
const AUTH_WRITE_WINDOW_MS = 10 * 60 * 1000; // 10 minutes
const AUTH_WRITE_MAX_ATTEMPTS = 20;

export const authWriteRateLimiterMiddleware: MiddlewareHandler = async (c, next) => {
  const ip = getClientIp(c);
  const now = Date.now();
  const entry = authWriteStore.get(ip);

  if (!entry || now > entry.resetAt) {
    authWriteStore.set(ip, { count: 1, resetAt: now + AUTH_WRITE_WINDOW_MS });
    return next();
  }

  entry.count += 1;

  if (entry.count > AUTH_WRITE_MAX_ATTEMPTS) {
    const retryAfter = Math.ceil((entry.resetAt - now) / 1000);
    c.res.headers.set("Retry-After", String(retryAfter));
    return c.json(
      {
        error: {
          code: "TOO_MANY_REQUESTS",
          message: "Too many auth attempts from this network. Please try again later.",
        },
      },
      429,
    );
  }

  return next();
};
