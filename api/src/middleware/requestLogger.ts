import type { MiddlewareHandler } from "hono";
import { routePath } from "hono/route";
import type { AppEnv } from "../types/index.js";
import { getDb } from "../db/index.js";
import { schema } from "../db/index.js";
import { getRelease } from "../utils/release.js";
import { redactTokenPath } from "../utils/redact-token-path.js";
import { decideRequestLog } from "./requestLogPolicy.js";

/**
 * request_logs rows: what was hit (raw path AND the matched route pattern,
 * so rows group by feature), what came back (status, the error envelope's
 * code + file:line), how long it took, and which deployed release served
 * it. That is enough to prove a route is live on the latest code and
 * working — or to show exactly where it fails.
 *
 * Not every request is written: crawler/beacon traffic is skipped and fast
 * successful GETs are sampled (see requestLogPolicy.ts). Each row carries
 * `sample_weight`, so readers sum weights instead of counting rows.
 */
export const requestLoggerMiddleware: MiddlewareHandler<AppEnv> = async (c, next) => {
  const startTime = Date.now();
  await next();
  const rawPath = new URL(c.req.url).pathname;
  const durationMs = Date.now() - startTime;
  const userAgent = c.req.header("user-agent");
  const decision = decideRequestLog({
    method: c.req.method,
    path: rawPath,
    status: c.res.status,
    durationMs,
    userAgent,
    userId: c.var.user?.sub ?? null,
  });
  if (!decision.log) return;
  // Emailed-link tokens (consent, invites, shares) never reach the log.
  const path = redactTokenPath(rawPath);
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
        userAgent,
        sampleWeight: decision.weight,
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
