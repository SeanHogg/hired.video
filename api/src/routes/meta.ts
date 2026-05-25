import { Hono } from "hono";
import type { Variables, AppEnv } from "../types/index.js";
import { success } from "../types/index.js";
import { detectCountry } from "../services/auth/geo.js";

/**
 * Meta routes — small public endpoints that surface request-context info
 * the frontend needs but can't read itself (e.g. Cloudflare geo-IP header).
 *
 * Mounted at /api/_meta/* (underscore prefix mirrors the convention for
 * platform-internal endpoints across our stack).
 */
export const metaRoutes = new Hono<AppEnv>();

/**
 * GET /api/_meta/geo
 *
 * Returns the visitor's best-guess country from the `cf-ipcountry` header
 * Cloudflare attaches to every request. Consumers:
 *   - useUserJurisdiction() hook for the dynamic Privacy / Terms / Cookie
 *     pages (gap #1153), to pick the right jurisdictional section for
 *     visitors who aren't signed in and haven't set a billing address.
 *   - signupGuard for the existing ALLOWED_SIGNUP_COUNTRIES check.
 *
 * No auth required — the response carries no PII about the visitor beyond
 * the country they already revealed by connecting.
 */
metaRoutes.get("/geo", async (c) => {
  const country = detectCountry(c.req.raw.headers);
  return c.json(success({ country: country ?? null }), 200, {
    // The country can change if the user moves networks but rarely within
    // a session. 5min is short enough to feel responsive on roaming and
    // long enough to keep the per-page hit off the worker hot path.
    "Cache-Control": "public, max-age=300",
  });
});
