/**
 * SuperAdmin gamification surface. Mounted at /api/admin/impersonate/points
 * (superAdminMiddleware applied once at the parent router).
 *
 *   GET    /                      — global stats + catalog
 *   GET    /top                   — top earners
 *   GET    /user/:userId          — full picture for one user
 *   POST   /user/:userId/adjust   — manual points adjust (positive or negative)
 *   POST   /user/:userId/suspend  — suspend points for the user
 *   POST   /user/:userId/reinstate — clear suspension
 *   GET    /fraud/queue           — open fraud flags
 *   POST   /fraud/:flagId/resolve — confirm / dismiss a flag
 */

import { Hono } from "hono";
import { z } from "zod";
import type { AppEnv } from "../../types/index.js";
import { success, error } from "../../types/index.js";
import { getDb } from "../../db/index.js";
import { buildRepos } from "../../repositories/index.js";
import { gamificationFromContext } from "../../domains/gamification/with-gamification.js";
import { auditLog, AUDIT_ACTIONS } from "../../utils/audit.js";

export const superadminPointsRoutes = new Hono<AppEnv>();

function actorId(c: { var: { user: { sub: string } } }): string {
  return c.var.user.sub;
}

// ── Reads ──────────────────────────────────────────────────────────────

superadminPointsRoutes.get("/", async (c) => {
  const game = gamificationFromContext(c);
  const stats = await buildRepos(getDb()).points.globalStats();
  return c.json(success({
    stats,
    catalog: game.getCatalog(),
  }));
});

const TopQuery = z.object({ limit: z.coerce.number().int().min(1).max(200).default(50) });

superadminPointsRoutes.get("/top", async (c) => {
  const parsed = TopQuery.safeParse(c.req.query());
  if (!parsed.success) return c.json(error("VALIDATION_ERROR", parsed.error.issues[0].message), 400);
  const repos = buildRepos(getDb());
  const top = await repos.points.topEarners(parsed.data.limit);
  return c.json(success({ top }));
});

superadminPointsRoutes.get("/user/:userId", async (c) => {
  const userId = c.req.param("userId");
  const repos = buildRepos(getDb());
  const game = gamificationFromContext(c);
  const [summary, fullActivity, flags] = await Promise.all([
    game.getUserSummary(userId),
    game.getActivityPage(userId, 200),
    repos.points.findFraudFlagsForUser(userId),
  ]);
  return c.json(success({ summary, activity: fullActivity, fraudFlags: flags }));
});

// ── Mutations ──────────────────────────────────────────────────────────

const AdjustBody = z.object({
  delta: z.number().int().refine((n) => n !== 0, { message: "delta cannot be 0" }),
  reason: z.string().min(3).max(500),
});

superadminPointsRoutes.post("/user/:userId/adjust", async (c) => {
  const targetId = c.req.param("userId");
  const parsed = AdjustBody.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json(error("VALIDATION_ERROR", parsed.error.issues[0].message), 400);

  const game = gamificationFromContext(c);
  const row = await game.adminAdjust({
    userId: targetId,
    delta: parsed.data.delta,
    reason: parsed.data.reason,
    adminUserId: actorId(c),
  });

  await auditLog({
    action: AUDIT_ACTIONS.POINTS_ADJUSTED,
    actorId: actorId(c),
    targetType: "user",
    targetId,
    metadata: { delta: parsed.data.delta, reason: parsed.data.reason, ledgerId: row.id },
  });

  return c.json(success({ ledger: row }));
});

const SuspendBody = z.object({ reason: z.string().min(3).max(500) });

superadminPointsRoutes.post("/user/:userId/suspend", async (c) => {
  const targetId = c.req.param("userId");
  const parsed = SuspendBody.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json(error("VALIDATION_ERROR", parsed.error.issues[0].message), 400);

  const row = await gamificationFromContext(c).adminSuspend(targetId, parsed.data.reason, actorId(c));
  await auditLog({
    action: AUDIT_ACTIONS.POINTS_SUSPENDED,
    actorId: actorId(c),
    targetType: "user",
    targetId,
    metadata: { reason: parsed.data.reason },
  });
  return c.json(success({ balance: row }));
});

superadminPointsRoutes.post("/user/:userId/reinstate", async (c) => {
  const targetId = c.req.param("userId");
  const row = await gamificationFromContext(c).adminReinstate(targetId, actorId(c));
  await auditLog({
    action: AUDIT_ACTIONS.POINTS_REINSTATED,
    actorId: actorId(c),
    targetType: "user",
    targetId,
  });
  return c.json(success({ balance: row }));
});

// ── Fraud queue ────────────────────────────────────────────────────────

const FraudQueueQuery = z.object({ limit: z.coerce.number().int().min(1).max(500).default(100) });

superadminPointsRoutes.get("/fraud/queue", async (c) => {
  const parsed = FraudQueueQuery.safeParse(c.req.query());
  if (!parsed.success) return c.json(error("VALIDATION_ERROR", parsed.error.issues[0].message), 400);
  const repos = buildRepos(getDb());
  const flags = await repos.points.findOpenFraudFlags(parsed.data.limit);
  return c.json(success({ flags }));
});

const ResolveBody = z.object({
  decision: z.enum(["confirmed", "dismissed"]),
  notes: z.string().max(1000).optional(),
  reinstate: z.boolean().optional(),
});

superadminPointsRoutes.post("/fraud/:flagId/resolve", async (c) => {
  const flagId = c.req.param("flagId");
  const parsed = ResolveBody.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json(error("VALIDATION_ERROR", parsed.error.issues[0].message), 400);

  const flag = await gamificationFromContext(c).resolveFraudFlag({
    flagId,
    decision: parsed.data.decision,
    reviewerId: actorId(c),
    notes: parsed.data.notes ?? null,
    reinstate: parsed.data.reinstate ?? false,
  });

  await auditLog({
    action: AUDIT_ACTIONS.POINTS_FRAUD_RESOLVED,
    actorId: actorId(c),
    targetType: "points_fraud_flag",
    targetId: flagId,
    metadata: { userId: flag.userId, decision: parsed.data.decision, reinstate: parsed.data.reinstate ?? false },
  });

  return c.json(success({ flag }));
});

// ── Redemptions queue ─────────────────────────────────────────────────

const RedemptionsQuery = z.object({
  status: z.enum(["pending", "queued", "fulfilled", "failed", "cancelled"]).optional(),
  limit: z.coerce.number().int().min(1).max(500).default(100),
});

/** Default lists pending+queued so SAs see what needs attention. Filter
 *  to other statuses for support follow-ups (failed = vendor retry,
 *  fulfilled = success audit). */
superadminPointsRoutes.get("/redemptions", async (c) => {
  const parsed = RedemptionsQuery.safeParse(c.req.query());
  if (!parsed.success) return c.json(error("VALIDATION_ERROR", parsed.error.issues[0].message), 400);
  const repos = buildRepos(getDb());

  if (parsed.data.status) {
    const rows = await repos.points.findRedemptionsByStatus(parsed.data.status, parsed.data.limit);
    return c.json(success({ redemptions: rows }));
  }
  const [pending, queued] = await Promise.all([
    repos.points.findRedemptionsByStatus("pending", parsed.data.limit),
    repos.points.findRedemptionsByStatus("queued", parsed.data.limit),
  ]);
  return c.json(success({ redemptions: [...pending, ...queued] }));
});

const ApproveBody = z.object({
  recipientName: z.string().min(1).max(120).optional(),
  recipientEmail: z.string().email().optional(),
});

superadminPointsRoutes.post("/redemptions/:id/approve", async (c) => {
  const id = c.req.param("id");
  const parsed = ApproveBody.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json(error("VALIDATION_ERROR", parsed.error.issues[0].message), 400);

  const row = await gamificationFromContext(c).approveRedemption({
    redemptionId: id,
    approverId: actorId(c),
    recipientName: parsed.data.recipientName,
    recipientEmail: parsed.data.recipientEmail,
  });

  await auditLog({
    action: AUDIT_ACTIONS.POINTS_REDEMPTION_APPROVED,
    actorId: actorId(c),
    targetType: "point_redemption",
    targetId: id,
    metadata: { userId: row.userId, kind: row.kind, valueCents: row.valueCents },
  });
  return c.json(success({ redemption: row }));
});

const CancelBody = z.object({ reason: z.string().min(3).max(500) });

superadminPointsRoutes.post("/redemptions/:id/cancel", async (c) => {
  const id = c.req.param("id");
  const parsed = CancelBody.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json(error("VALIDATION_ERROR", parsed.error.issues[0].message), 400);

  const row = await gamificationFromContext(c).cancelRedemption({
    redemptionId: id,
    reason: parsed.data.reason,
    actorId: actorId(c),
  });

  await auditLog({
    action: AUDIT_ACTIONS.POINTS_REDEMPTION_CANCELLED,
    actorId: actorId(c),
    targetType: "point_redemption",
    targetId: id,
    metadata: { userId: row.userId, reason: parsed.data.reason },
  });
  return c.json(success({ redemption: row }));
});

const W9Body = z.object({
  legalName: z.string().min(2).max(200),
  taxIdLast4: z.string().regex(/^\d{4}$/),
  taxClassification: z.enum(["personal", "business"]),
});

superadminPointsRoutes.post("/user/:userId/w9", async (c) => {
  const targetId = c.req.param("userId");
  const parsed = W9Body.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json(error("VALIDATION_ERROR", parsed.error.issues[0].message), 400);

  const row = await gamificationFromContext(c).markW9Collected({
    userId: targetId,
    ...parsed.data,
  });

  await auditLog({
    action: AUDIT_ACTIONS.POINTS_W9_COLLECTED,
    actorId: actorId(c),
    targetType: "user",
    targetId,
    metadata: { taxClassification: parsed.data.taxClassification, taxIdLast4: parsed.data.taxIdLast4 },
  });

  return c.json(success({ taxStatus: row }));
});
