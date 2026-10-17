/**
 * /api/admin/security/* — SuperAdmin-only operator surface.
 *
 * Three sub-resources:
 *   GET  /locked-accounts           — list every active lock
 *   POST /locked-accounts/:id/unlock — manual unlock
 *   POST /locked-accounts/:userId/lock — manual lock
 *   GET  /bot-stats                 — aggregated counts for the globe
 *   GET  /bot-events                — paginated raw events (drill-in)
 *   GET  /region-waitlist           — out-of-region demand list
 *   POST /region-waitlist/:id/review — mark invited / declined
 *
 * Every handler chains authMiddleware + superAdminMiddleware. The
 * lock/unlock fns are imported from services/auth/lock.ts — same path
 * the brute-force counter uses, no duplicate primitive.
 */

import { Hono } from "hono";
import { and, desc, eq, gte, sql } from "drizzle-orm";
import { z } from "zod";
import type { Variables, AppEnv } from "../types/index.js";
import { success, error } from "../types/index.js";
import { getDb, schema } from "../db/index.js";
import { authMiddleware } from "../middleware/auth.js";
import { superAdminMiddleware } from "../middleware/superAdmin.js";
import { lockAccount, unlockAccount, isAccountLocked } from "../services/auth/lock.js";
import { clampLimit } from "../utils/pagination.js";

const { users, accountLocks, botBlockEvents, regionWaitlist } = schema;

export const adminSecurityRoutes = new Hono<AppEnv>();

adminSecurityRoutes.use("*", authMiddleware, superAdminMiddleware);

// ---------------------------------------------------------------------
// Locked accounts list
// ---------------------------------------------------------------------
adminSecurityRoutes.get("/locked-accounts", async (c) => {
  const db = getDb();
  const rows = await db
    .select({
      lockId: accountLocks.id,
      userId: accountLocks.userId,
      email: users.email,
      name: users.name,
      reason: accountLocks.reason,
      lockedAt: accountLocks.lockedAt,
      unlocksAt: accountLocks.unlocksAt,
      lockedBy: accountLocks.lockedBy,
      notes: accountLocks.notes,
    })
    .from(accountLocks)
    .innerJoin(users, eq(users.id, accountLocks.userId))
    .where(eq(accountLocks.active, true))
    .orderBy(desc(accountLocks.lockedAt));
  return c.json(success(rows));
});

const ManualLockSchema = z.object({
  reason: z.enum(["admin_manual", "bot_signal", "compromised_credentials", "support_request"]).default("admin_manual"),
  notes: z.string().max(500).optional(),
  durationMinutes: z.number().int().min(1).max(60 * 24 * 30).optional(),
});

adminSecurityRoutes.post("/locked-accounts/:userId/lock", async (c) => {
  const targetUserId = c.req.param("userId");
  const body = await c.req.json().catch(() => ({}));
  const parsed = ManualLockSchema.safeParse(body);
  if (!parsed.success) return c.json(error("VALIDATION_ERROR", "Invalid body"), 400);
  const adminId = c.var.user?.sub as string;
  const db = getDb();
  const unlocksAt = parsed.data.durationMinutes
    ? new Date(Date.now() + parsed.data.durationMinutes * 60 * 1000)
    : null;
  const lock = await lockAccount({
    db,
    userId: targetUserId,
    reason: parsed.data.reason,
    lockedBy: adminId,
    unlocksAt,
    notes: parsed.data.notes ?? null,
  });
  return c.json(success(lock));
});

// Per-user lock status. Powers the standalone LockedAccountBadge so any
// admin surface (user list rows, profile headers) can render the badge
// by user id alone — no canShowBadge prop drilling.
adminSecurityRoutes.get("/locked-accounts/:userId/status", async (c) => {
  const targetUserId = c.req.param("userId");
  const db = getDb();
  const lock = await isAccountLocked(db, targetUserId);
  return c.json(
    success({
      locked: !!lock,
      reason: lock?.reason ?? null,
      unlocksAt: lock?.unlocksAt ? new Date(lock.unlocksAt).toISOString() : null,
    }),
  );
});

adminSecurityRoutes.post("/locked-accounts/:userId/unlock", async (c) => {
  const targetUserId = c.req.param("userId");
  const adminId = c.var.user?.sub as string;
  const db = getDb();
  await unlockAccount({ db, userId: targetUserId, unlockedBy: adminId });
  return c.json(success(null, "Account unlocked"));
});

// ---------------------------------------------------------------------
// Bot block stats — feeds the SuperAdmin globe.
// Returns: per-country counts and per-reason counts for the requested
// window, plus stat-card summary numbers. Globe FE consumes this single
// shape to build choropleth + legend; no duplicate aggregation paths.
// ---------------------------------------------------------------------

const RANGE_WINDOWS_MS: Record<string, number> = {
  "1h": 60 * 60 * 1000,
  "24h": 24 * 60 * 60 * 1000,
  "7d": 7 * 24 * 60 * 60 * 1000,
  "30d": 30 * 24 * 60 * 60 * 1000,
};

adminSecurityRoutes.get("/bot-stats", async (c) => {
  const range = c.req.query("range") ?? "24h";
  const windowMs = RANGE_WINDOWS_MS[range] ?? RANGE_WINDOWS_MS["24h"]!;
  const since = new Date(Date.now() - windowMs);
  const db = getDb();

  const [byCountry, byReason, total] = await Promise.all([
    db
      .select({
        countryCode: botBlockEvents.countryCode,
        count: sql<number>`count(*)::int`,
      })
      .from(botBlockEvents)
      .where(gte(botBlockEvents.createdAt, since))
      .groupBy(botBlockEvents.countryCode),
    db
      .select({
        reason: botBlockEvents.reason,
        count: sql<number>`count(*)::int`,
      })
      .from(botBlockEvents)
      .where(gte(botBlockEvents.createdAt, since))
      .groupBy(botBlockEvents.reason),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(botBlockEvents)
      .where(gte(botBlockEvents.createdAt, since)),
  ]);

  return c.json(
    success({
      range,
      since: since.toISOString(),
      total: total[0]?.count ?? 0,
      byCountry,
      byReason,
    }),
  );
});

adminSecurityRoutes.get("/bot-events", async (c) => {
  const limit = clampLimit(c.req.query("limit"), 100, 500);
  const db = getDb();
  const rows = await db
    .select()
    .from(botBlockEvents)
    .orderBy(desc(botBlockEvents.createdAt))
    .limit(limit);
  return c.json(success(rows));
});

// ---------------------------------------------------------------------
// Region waitlist
// ---------------------------------------------------------------------

adminSecurityRoutes.get("/region-waitlist", async (c) => {
  const status = c.req.query("status") ?? "pending";
  const db = getDb();
  const rows = await db
    .select()
    .from(regionWaitlist)
    .where(eq(regionWaitlist.status, status))
    .orderBy(desc(regionWaitlist.createdAt));
  return c.json(success(rows));
});

const ReviewWaitlistSchema = z.object({
  status: z.enum(["invited", "declined"]),
});

adminSecurityRoutes.post("/region-waitlist/:id/review", async (c) => {
  const id = c.req.param("id");
  const body = await c.req.json().catch(() => ({}));
  const parsed = ReviewWaitlistSchema.safeParse(body);
  if (!parsed.success) return c.json(error("VALIDATION_ERROR", "Invalid body"), 400);
  const adminId = c.var.user?.sub as string;
  const db = getDb();
  await db
    .update(regionWaitlist)
    .set({
      status: parsed.data.status,
      reviewedBy: adminId,
      reviewedAt: new Date(),
    } as any)
    .where(eq(regionWaitlist.id, id));
  return c.json(success(null, `Marked ${parsed.data.status}`));
});
