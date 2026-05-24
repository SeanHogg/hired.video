/**
 * User-facing gamification routes.
 *
 *   GET  /api/points/me           — balance, streak, badges, recent activity
 *   GET  /api/points/activity     — paginated ledger
 *   GET  /api/points/catalog      — action rules + redemption SKUs (for UI)
 *   POST /api/points/session/ping — record a daily-session activity signal
 *   POST /api/points/redeem       — Phase-3 endpoint; today returns 501
 *
 * Auth: standard JWT (mounted under the global auth middleware).
 */

import { Hono } from "hono";
import { z } from "zod";
import type { AppEnv } from "../types/index.js";
import { success, error } from "../types/index.js";
import { getDb } from "../db/index.js";
import { buildRepos } from "../repositories/index.js";
import { GamificationService } from "../domains/gamification/index.js";
import { pickScoringRole } from "../../../shared/user-roles.js";

export const pointsRoutes = new Hono<AppEnv>();

/** Build the service for the current request. Thread the worker env so
 *  the redemption engine can construct a Tremendous client when the
 *  user redeems a gift card. */
function service(env: Record<string, string | undefined>) {
  return new GamificationService(buildRepos(getDb()), {
    workerEnv: env,
  });
}

pointsRoutes.get("/me", async (c) => {
  const userId = c.var.user.sub;
  const summary = await service(c.env as never).getUserSummary(userId);
  return c.json(success(summary));
});

const ActivityQuery = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

pointsRoutes.get("/activity", async (c) => {
  const userId = c.var.user.sub;
  const parsed = ActivityQuery.safeParse(c.req.query());
  if (!parsed.success) {
    return c.json(error("VALIDATION_ERROR", parsed.error.issues[0].message), 400);
  }
  const items = await service(c.env as never).getActivityPage(userId, parsed.data.limit);
  return c.json(success({ items }));
});

pointsRoutes.get("/catalog", async (c) => {
  return c.json(success(service(c.env as never).getCatalog()));
});

/** Daily-session ping. The frontend hits this once per app load; the
 *  engine collapses repeated calls via the `daily:YYYY-MM-DD` refId. */
pointsRoutes.post("/session/ping", async (c) => {
  const userId = c.var.user.sub;
  const role = pickScoringRole(c.var.user.roles);
  if (!role) return c.json(success({ awarded: false, reason: "role_mismatch" }));
  const out = await service(c.env as never).onDailySession({ userId, role });
  return c.json(success({
    awarded: out.status === "awarded",
    delta: out.status === "awarded" ? out.delta : 0,
    balance: out.status === "awarded" ? out.balance : undefined,
    reason: out.status === "no-op" ? out.reason : undefined,
  }));
});

const RedeemBody = z.object({
  skuId: z.string().min(1),
  /** Required when the SKU is `gift_card` — Tremendous delivers the
   *  reward to this email/name. Ignored for ai_credits / premium_month. */
  recipientName: z.string().min(1).max(120).optional(),
  recipientEmail: z.string().email().optional(),
});

pointsRoutes.post("/redeem", async (c) => {
  const userId = c.var.user.sub;
  const parsed = RedeemBody.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) {
    return c.json(error("VALIDATION_ERROR", parsed.error.issues[0].message), 400);
  }

  const out = await service(c.env as never).redeem({
    userId,
    skuId: parsed.data.skuId,
    recipientName: parsed.data.recipientName,
    recipientEmail: parsed.data.recipientEmail,
  });

  if (out.status === "rejected") {
    const code = out.reason === "insufficient_balance" ? "INSUFFICIENT_BALANCE"
      : out.reason === "suspended" ? "POINTS_SUSPENDED"
      : out.reason === "unknown_sku" ? "NOT_FOUND"
      : "VENDOR_UNAVAILABLE";
    const status = out.reason === "unknown_sku" ? 404 : 400;
    return c.json(error(code, out.message), status);
  }

  return c.json(success({
    status: out.status,
    redemptionId: out.redemption.id,
    redemption: out.redemption,
  }));
});

/** Per-user redemption history. */
pointsRoutes.get("/redemptions", async (c) => {
  const userId = c.var.user.sub;
  const repos = buildRepos(getDb());
  const rows = await repos.points.findRedemptionsForUser(userId, 100);
  return c.json(success({ redemptions: rows }));
});
