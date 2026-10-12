import type { MiddlewareHandler } from "hono";
import { routePath } from "hono/route";
import type { AppEnv } from "../types/index.js";
import { getDb } from "../db/index.js";
import { schema } from "../db/index.js";
import { getRelease } from "../utils/release.js";

// Requests that carry no analytics signal (CORS preflights, HEAD probes,
// health checks) — skipping them saves a Neon INSERT per request.
const SKIPPED_METHODS = new Set(["OPTIONS", "HEAD"]);
const SKIPPED_PATHS = new Set(["/health", "/api/health"]);

/**
 * One request_logs row per request: what was hit (raw path AND the matched
 * route pattern, so rows group by feature), what came back (status, the
 * error envelope's code + file:line), how long it took, and which deployed
 * release served it. That is enough to prove a route is live on the latest
 * code and working — or to show exactly where it fails.
 */
export const requestLoggerMiddleware: MiddlewareHandler<AppEnv> = async (c, next) => {
  const startTime = Date.now();
  await next();
  if (SKIPPED_METHODS.has(c.req.method)) return;
  const path = new URL(c.req.url).pathname;
  if (SKIPPED_PATHS.has(path)) return;
  const durationMs = Date.now() - startTime;
  // Lazily-mounted sub-apps report their own pattern; directly-registered
  // routes resolve from this context.
  const route = (c.var.routePattern ?? routePath(c)).slice(0, 255) || null;
  const envelope = c.var.errorEnvelope;

  // Off the response path, but registered with waitUntil so the Workers
  // runtime does not cancel the INSERT once the response is sent.
  const write = (async () => {
    try {
      await getDb().insert(schema.requestLogs).values({
        method: c.req.method,
        path,
        route,
        statusCode: c.res.status,
        durationMs,
        releaseId: getRelease()?.id ?? null,
        errorCode: envelope?.code ?? null,
        errorSource: envelope?.source ?? null,
        userId: c.var.user?.sub ?? undefined,
        ipAddress: (c.req.header("cf-connecting-ip") ?? c.req.header("x-forwarded-for")?.split(",")[0])?.trim(),
        userAgent: c.req.header("user-agent"),
      });
    } catch {
      // Silently ignore logging failures
    }
  })();
  try {
    c.executionCtx.waitUntil(write);
  } catch {
    // No ExecutionContext (Node tests) — the promise still runs detached.
  }
};
