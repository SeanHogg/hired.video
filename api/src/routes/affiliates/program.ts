// /api/affiliates — the signed-in affiliate's programme surface (profile,
// dashboard, stats, referrals, conversions, payout requests) plus the public
// click tracker and leaderboard. Thin adapters over
// services/affiliates/affiliateProgramService.ts.
import { Hono } from "hono";
import type { AppEnv } from "../../types/index.js";
import { toHandlerResult } from "../../handlers/shared.js";
import { requireUser, sendHandlerResult } from "../helpers/routerHelpers.js";
import {
  getAffiliateDashboard,
  getAffiliateLeaderboard,
  getAffiliateStats,
  getOrCreateAffiliateProfile,
  listAffiliateConversionsForUser,
  listAffiliateReferralsForUser,
  requestAffiliatePayout,
  trackAffiliateClick,
  updateAffiliateProfile,
} from "../../services/affiliates/affiliateProgramService.js";

export const affiliateProgramRoutes = new Hono<AppEnv>();

/** GET /api/affiliates/profile — get or auto-create affiliate profile */
affiliateProgramRoutes.get("/profile", async (c) => {
  const userId = requireUser(c);
  return sendHandlerResult(c, await toHandlerResult(getOrCreateAffiliateProfile(userId)));
});

/** PATCH /api/affiliates/profile — update payout email / specialty sectors */
affiliateProgramRoutes.patch("/profile", async (c) => {
  const userId = requireUser(c);
  const body = await c.req.json().catch(() => ({}));
  return sendHandlerResult(
    c,
    await toHandlerResult(
      updateAffiliateProfile(userId, { payoutEmail: body.payoutEmail, specialtySectors: body.specialtySectors }),
    ),
  );
});

/**
 * POST /api/affiliates/click — record a referral link click (public endpoint)
 * Body: { referralCode, targetPath?, landingSector? }
 */
affiliateProgramRoutes.post("/click", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  return sendHandlerResult(
    c,
    await toHandlerResult(
      trackAffiliateClick({
        referralCode: body.referralCode,
        targetPath: body.targetPath ?? null,
        landingSector: body.landingSector,
        ipAddress: c.req.header("cf-connecting-ip") ?? c.req.header("x-forwarded-for") ?? null,
        userAgent: c.req.header("user-agent") ?? null,
        referer: c.req.header("referer") ?? null,
      }),
    ),
  );
});

/** GET /api/affiliates/dashboard — aggregated dashboard data for the frontend */
affiliateProgramRoutes.get("/dashboard", async (c) => {
  const userId = requireUser(c);
  return sendHandlerResult(c, await toHandlerResult(getAffiliateDashboard(userId)));
});

/** GET /api/affiliates/stats — earnings, clicks, conversions summary */
affiliateProgramRoutes.get("/stats", async (c) => {
  const userId = requireUser(c);
  return sendHandlerResult(c, await toHandlerResult(getAffiliateStats(userId)));
});

/** GET /api/affiliates/leaderboard — top 20 affiliates by conversion count */
affiliateProgramRoutes.get("/leaderboard", async (c) =>
  sendHandlerResult(c, await toHandlerResult(getAffiliateLeaderboard())),
);

/** GET /api/affiliates/referrals — list referrals for the current user */
affiliateProgramRoutes.get("/referrals", async (c) => {
  const userId = requireUser(c);
  return sendHandlerResult(c, await toHandlerResult(listAffiliateReferralsForUser(userId, 100)));
});

/** GET /api/affiliates/conversions — list conversions (earnings) */
affiliateProgramRoutes.get("/conversions", async (c) => {
  const userId = requireUser(c);
  return sendHandlerResult(c, await toHandlerResult(listAffiliateConversionsForUser(userId, 100)));
});

/** POST /api/affiliates/payout — request a payout */
affiliateProgramRoutes.post("/payout", async (c) => {
  const userId = requireUser(c);
  return sendHandlerResult(c, await toHandlerResult(requestAffiliatePayout(userId), 201));
});
