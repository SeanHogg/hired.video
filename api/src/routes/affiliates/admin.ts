// /api/affiliates/admin/* — platform-admin affiliate operations (gap #1684).
// Every endpoint here requires a platform admin (adminMiddleware). Thin
// adapters over services/affiliates/affiliateAdminService.ts.
import { Hono } from "hono";
import type { AppEnv } from "../../types/index.js";
import { toHandlerResult } from "../../handlers/shared.js";
import { adminMiddleware } from "../../middleware/superAdmin.js";
import { sendHandlerResult } from "../helpers/routerHelpers.js";
import {
  getPayoutStatus,
  listPendingPayouts,
  setAffiliateStatus,
  setPayoutStatus,
  type AffiliateStatus,
  type PayoutStatus,
} from "../../services/affiliates/affiliateAdminService.js";
import {
  listAffiliateConversionsForUser,
  listAffiliateReferralsForUser,
} from "../../services/affiliates/affiliateProgramService.js";

export const affiliateAdminRoutes = new Hono<AppEnv>();

affiliateAdminRoutes.use("/admin/*", adminMiddleware);

const AFFILIATE_STATUS_ACTIONS: Array<[string, AffiliateStatus]> = [
  ["activate", "active"],
  ["deactivate", "disabled"],
  ["suspend", "suspended"],
  ["unsuspend", "active"],
];
for (const [action, status] of AFFILIATE_STATUS_ACTIONS) {
  affiliateAdminRoutes.post(`/admin/:userId/${action}`, async (c) =>
    sendHandlerResult(c, await toHandlerResult(setAffiliateStatus(c.req.param("userId"), status))),
  );
}

affiliateAdminRoutes.get("/admin/:userId/referrals", async (c) =>
  sendHandlerResult(c, await toHandlerResult(listAffiliateReferralsForUser(c.req.param("userId"), 200))),
);

affiliateAdminRoutes.get("/admin/:userId/conversions", async (c) =>
  sendHandlerResult(c, await toHandlerResult(listAffiliateConversionsForUser(c.req.param("userId"), 200))),
);

affiliateAdminRoutes.get("/admin/pending-payouts", async (c) =>
  sendHandlerResult(c, await toHandlerResult(listPendingPayouts())),
);

const PAYOUT_STATUS_ACTIONS: Array<[string, PayoutStatus]> = [
  ["approve", "approved"],
  ["reject", "rejected"],
  ["process", "processed"],
];
for (const [action, status] of PAYOUT_STATUS_ACTIONS) {
  affiliateAdminRoutes.post(`/admin/payout/:payoutId/${action}`, async (c) =>
    sendHandlerResult(c, await toHandlerResult(setPayoutStatus(c.req.param("payoutId"), status))),
  );
}

affiliateAdminRoutes.get("/admin/payout/:payoutId/status", async (c) =>
  sendHandlerResult(c, await toHandlerResult(getPayoutStatus(c.req.param("payoutId")))),
);
