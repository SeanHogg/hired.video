import { Hono } from "hono";
import type { Variables, AppEnv } from "../types/index.js";
import { success } from "../types/index.js";
import { getSubscription } from "../services/billing/BillingService.js";

export const adsRoutes = new Hono<AppEnv>();

/**
 * Named ad slots — change publisher ID or slot IDs here without touching the
 * frontend. Slot IDs come from the AdSense dashboard (Ads → Ad units).
 *
 * In production these should be driven by env vars or a DB table so they can
 * be updated without a redeploy.
 */
function getAdConfig(env: Record<string, string | undefined>) {
  const publisherId = env.ADSENSE_PUBLISHER_ID ?? "";
  const enabled = Boolean(publisherId);

  return {
    publisherId,
    enabled,
    slots: {
      "dashboard-banner":   env.AD_SLOT_DASHBOARD_BANNER   ?? "",
      "dashboard-sidebar":  env.AD_SLOT_DASHBOARD_SIDEBAR  ?? "",
      "jobs-banner":        env.AD_SLOT_JOBS_BANNER        ?? "",
      "jobs-sidebar":       env.AD_SLOT_JOBS_SIDEBAR       ?? "",
      "people-banner":      env.AD_SLOT_PEOPLE_BANNER      ?? "",
      "profile-sidebar":    env.AD_SLOT_PROFILE_SIDEBAR    ?? "",
      "resume-banner":      env.AD_SLOT_RESUME_BANNER      ?? "",
    } as Record<string, string>,
  };
}

// ---------------------------------------------------------------------------
// GET /api/ads/config
// Public-ish: works with or without auth. Authenticated Pro users receive
// { adsEnabled: false } so the frontend suppresses all ad slots immediately.
// Unauthenticated or free-tier users receive the full slot config.
// ---------------------------------------------------------------------------
adsRoutes.get("/config", async (c) => {
  const userId = c.var.user?.sub; // set by optionalAuthMiddleware in app.ts
  const env = (c.env ?? {}) as Record<string, string | undefined>;
  const config = getAdConfig(env);

  // Pro users: ads off — return early without exposing slot details
  if (userId) {
    const sub = await getSubscription(userId).catch(() => null);
    if (sub?.isPro) {
      return c.json(success({ adsEnabled: false, publisherId: "", slots: {} }), 200);
    }
  }

  return c.json(
    success({
      adsEnabled: config.enabled,
      publisherId: config.publisherId,
      slots: config.slots,
    }),
    200,
  );
});
