/**
 * Campaign $ — gap #169.
 *
 * Internal-credit balance redeemable for ad / boost spend. Granted by
 * the redemption-engine when a user redeems a `campaign_dollars` SKU;
 * spent by the boosts checkout flow before charging Stripe. This route
 * just exposes the read paths + a debit hook the boosts route can call.
 */
import { Hono } from "hono";
import { buildRepos } from "../repositories/index.js";
import { getDb } from "../db/index.js";
import { success, error } from "../types/index.js";
import type { AppEnv } from "../types/index.js";
import { clampLimit } from "../utils/pagination.js";

export const campaignDollarsRoutes = new Hono<AppEnv>();

function uid(c: any): string | null {
  return (c.var.user?.sub as string | undefined) ?? null;
}

campaignDollarsRoutes.get("/balance", async (c) => {
  const userId = uid(c);
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  const repos = buildRepos(getDb());
  const balance = await repos.points.findCampaignDollarsBalance(userId);
  return c.json(success({
    balance: balance ?? {
      userId,
      balanceCents: 0,
      lifetimeGrantedCents: 0,
      lifetimeSpentCents: 0,
      rateCentsPer1kPoints: null,
    },
  }), 200);
});

campaignDollarsRoutes.get("/transactions", async (c) => {
  const userId = uid(c);
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  const limit = clampLimit(c.req.query("limit"), 50, 200);
  const repos = buildRepos(getDb());
  const transactions = await repos.points.listCampaignDollarsTransactions(userId, limit);
  return c.json(success({ transactions }), 200);
});
