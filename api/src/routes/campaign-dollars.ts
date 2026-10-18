/**
 * Campaign $ — gap #169.
 *
 * Internal-credit balance redeemable for ad / boost spend. Granted by
 * the redemption-engine when a user redeems a `campaign_dollars` SKU;
 * spent by the boosts checkout flow before charging Stripe. This route
 * just exposes the read paths + a debit hook the boosts route can call.
 */
import { Hono } from "hono";
import {
  getCampaignDollarsBalance,
  listCampaignDollarsTransactions,
} from "../services/gamification/pointsReads.js";
import { success } from "../types/index.js";
import type { AppEnv } from "../types/index.js";
import { clampLimit } from "../utils/pagination.js";
import { requireUser } from "./helpers/routerHelpers.js";

export const campaignDollarsRoutes = new Hono<AppEnv>();

campaignDollarsRoutes.get("/balance", async (c) => {
  const userId = requireUser(c);
  const balance = await getCampaignDollarsBalance(userId);
  return c.json(success({ balance }), 200);
});

campaignDollarsRoutes.get("/transactions", async (c) => {
  const userId = requireUser(c);
  const limit = clampLimit(c.req.query("limit"), 50, 200);
  const transactions = await listCampaignDollarsTransactions(userId, limit);
  return c.json(success({ transactions }), 200);
});
