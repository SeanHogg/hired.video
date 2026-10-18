/**
 * POST /api/analytics/events — the ONE analytics ingestion beacon.
 *
 * Optional-auth (anon visitors + signed-in users). Body is a single event
 * (`{ kind, ... }`) or a batch (`{ events: [...] }`); see
 * shared/analytics-events.ts for the kinds and
 * services/analytics/event-kinds.ts for where each one is written.
 *
 * The body is read as text and JSON-parsed here because
 * `navigator.sendBeacon` posts text/plain or an arbitrary Blob type.
 * Fire-and-forget: always 202 with accepted/rejected counts unless the body
 * isn't a JSON object at all.
 */
import { Hono } from "hono";
import type { AppEnv } from "../../types/index.js";
import { success, error } from "../../types/index.js";
import {
  ingestAnalyticsEvents,
  parseEventsBody,
  type AnalyticsRequestContext,
} from "../../services/analytics/event-kinds.js";
import { ipCountryFromCtx } from "../../services/analytics/artifactView.js";
import { hashClientIp } from "../../utils/crypto.js";

export const analyticsEventsRoutes = new Hono<AppEnv>();

analyticsEventsRoutes.post("/events", async (c) => {
  const events = parseEventsBody(await c.req.text().catch(() => ""));
  if (!events) {
    return c.json(error("VALIDATION_ERROR", "Body must be an event or { events: [...] }"), 400);
  }
  const ctx: AnalyticsRequestContext = {
    userId: c.var.userId ?? null,
    roles: c.var.user?.roles ?? null,
    ipAddress: c.req.header("cf-connecting-ip") ?? c.req.header("x-forwarded-for") ?? null,
    ipHash: hashClientIp(c),
    ipCountry: ipCountryFromCtx(c),
    countryHeader: c.req.header("cf-ipcountry") ?? null,
    region: c.req.header("cf-region-code") ?? null,
    userAgent: c.req.header("user-agent") ?? null,
    referer: c.req.header("referer") ?? c.req.header("referrer") ?? null,
  };
  const result = await ingestAnalyticsEvents(events, ctx);
  return c.json(success(result), 202);
});
