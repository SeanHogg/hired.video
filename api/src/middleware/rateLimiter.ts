import type { Context, MiddlewareHandler } from "hono";

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const store = new Map<string, RateLimitEntry>();
const WINDOW_MS = 60_000;
const MAX_REQUESTS = 100;

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

export const rateLimiterMiddleware: MiddlewareHandler = async (c, next) => {
  const ip = getClientIp(c);
  const now = Date.now();
  const entry = store.get(ip);

  if (!entry || now > entry.resetAt) {
    store.set(ip, { count: 1, resetAt: now + WINDOW_MS });
    return next();
  }

  entry.count += 1;

  if (entry.count > MAX_REQUESTS) {
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
