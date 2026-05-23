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
import type { Variables } from "../types/index.js";
import { success, error } from "../types/index.js";
import { getDb } from "../db/index.js";
import { buildRepos } from "../repositories/index.js";
import { GamificationService } from "../domains/gamification/index.js";
import { pickScoringRole } from "../../../shared/user-roles.js";

export const pointsRoutes = new Hono<{ Variables: Variables }>();

function service() {
  return new GamificationService(buildRepos(getDb()));
}

pointsRoutes.get("/me", async (c) => {
  const userId = c.var.user.sub;
  const summary = await service().getUserSummary(userId);
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
  const items = await service().getActivityPage(userId, parsed.data.limit);
  return c.json(success({ items }));
});

pointsRoutes.get("/catalog", async (c) => {
  return c.json(success(service().getCatalog()));
});

/** Daily-session ping. The frontend hits this once per app load; the
 *  engine collapses repeated calls via the `daily:YYYY-MM-DD` refId. */
pointsRoutes.post("/session/ping", async (c) => {
  const userId = c.var.user.sub;
  const role = pickScoringRole(c.var.user.roles);
  if (!role) return c.json(success({ awarded: false, reason: "role_mismatch" }));
  const out = await service().onDailySession({ userId, role });
  return c.json(success({
    awarded: out.status === "awarded",
    delta: out.status === "awarded" ? out.delta : 0,
    balance: out.status === "awarded" ? out.balance : undefined,
    reason: out.status === "no-op" ? out.reason : undefined,
  }));
});

const RedeemBody = z.object({
  skuId: z.string().min(1),
});

/** Redemption endpoint. Phase 3 wires Tremendous + the actual conversion
 *  (points → tokens, plan-override, gift card). Phase 1 returns 501 so
 *  the UI can hook into the same route and just show "coming soon" until
 *  the backend lights up. */
pointsRoutes.post("/redeem", async (c) => {
  const parsed = RedeemBody.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) {
    return c.json(error("VALIDATION_ERROR", parsed.error.issues[0].message), 400);
  }

  const sku = service().getRedemptionSku(parsed.data.skuId);
  if (!sku) return c.json(error("NOT_FOUND", "Unknown redemption SKU"), 404);

  // Phase-1 gate. Frontend can pre-call this to show a "coming soon"
  // notice without faking the API surface.
  return c.json(
    error(
      "NOT_IMPLEMENTED",
      `Redemption for ${sku.label} (${sku.pointsCost} points) is queued for Phase 3.`,
    ),
    501,
  );
});
