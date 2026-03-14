import type { MiddlewareHandler } from "hono";

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const store = new Map<string, RateLimitEntry>();
const WINDOW_MS = 60_000;
const MAX_REQUESTS = 100;

export const rateLimiterMiddleware: MiddlewareHandler = async (c, next) => {
  const ip = c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
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
