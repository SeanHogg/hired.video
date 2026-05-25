import type { MiddlewareHandler } from "hono";
import type { Variables, AppEnv } from "../types/index.js";
import { getDb } from "../db/index.js";
import { schema } from "../db/index.js";

export const requestLoggerMiddleware: MiddlewareHandler<AppEnv> = async (c, next) => {
  const startTime = Date.now();
  await next();
  const durationMs = Date.now() - startTime;

  // Fire-and-forget — do not await
  void (async () => {
    try {
      const db = getDb();
      const userId = c.var.user?.sub ?? null;
      await db.insert(schema.requestLogs).values({
        method: c.req.method,
        path: new URL(c.req.url).pathname,
        statusCode: c.res.status,
        durationMs,
        userId: userId ?? undefined,
        ipAddress: c.req.header("x-forwarded-for")?.split(",")[0]?.trim(),
        userAgent: c.req.header("user-agent"),
      } as any);
    } catch {
      // Silently ignore logging failures
    }
  })();
};
