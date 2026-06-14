/**
 * Usage tracking ingestion (#2044). Mounted at /api/usage.
 *
 *   POST /api/usage/track — batched, consent-gated beacon (optional-auth, so
 *     anon visitors AND authed users both post; the session links to user_id
 *     when a JWT is present). Fire-and-forget: returns 202 and never blocks the
 *     client. Server identity (userId/roles) + geo come from the request, never
 *     from the body.
 */
import { Hono } from "hono";
import type { AppEnv } from "../types/index.js";
import { success, error } from "../types/index.js";
import { getDb } from "../db/index.js";
import { buildRepos } from "../repositories/index.js";
import { UsageService } from "../services/usage/UsageService.js";
import { TrackUsageSchema } from "../../../shared/usage.js";

export const usageRoutes = new Hono<AppEnv>();

usageRoutes.post("/track", async (c) => {
  const parsed = TrackUsageSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) {
    return c.json(error("VALIDATION_ERROR", parsed.error.issues[0]?.message ?? "Invalid body"), 400);
  }
  const service = new UsageService(buildRepos(getDb()).usageTracking);
  await service
    .recordBatch(parsed.data, {
      userId: c.var.user?.sub ?? null,
      roles: c.var.user?.roles ?? null,
      country: c.req.header("cf-ipcountry") ?? null,
      userAgent: c.req.header("user-agent") ?? null,
    })
    .catch(() => undefined); // best-effort; never fail the beacon
  return c.json(success({ accepted: true }), 202);
});

export default usageRoutes;
