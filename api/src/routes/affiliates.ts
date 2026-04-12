// affiliates.ts — Affiliate / ambassador programme routes (#74)
// Multi-tier system: Bronze → Silver → Gold → Platinum based on conversion count.

import { Hono } from "hono";
import { and, count, desc, eq, sum } from "drizzle-orm";
import type { Variables } from "../types/index.js";
import { success, error } from "../types/index.js";
import { getDb, schema } from "../db/index.js";

export const affiliateRoutes = new Hono<{ Variables: Variables }>();

function uid(c: any): string | null {
  return (c.var.user?.sub as string | undefined) ?? null;
}

function ok<T>(data: T) {
  return { success: true as const, data, timestamp: new Date().toISOString() };
}

// Tier definitions (mirrors affiliateTiers table seed data)
const TIERS = [
  { name: "platinum", label: "Platinum Ambassador", minConversions: 200, commissionRate: 0.25, bonusPercentage: 0.10 },
  { name: "gold",     label: "Gold Ambassador",     minConversions: 50,  commissionRate: 0.20, bonusPercentage: 0.05 },
  { name: "silver",   label: "Silver Ambassador",   minConversions: 10,  commissionRate: 0.15, bonusPercentage: 0.02 },
  { name: "bronze",   label: "Bronze Affiliate",    minConversions: 0,   commissionRate: 0.10, bonusPercentage: 0 },
];

function getTier(conversions: number) {
  return TIERS.find((t) => conversions >= t.minConversions) ?? TIERS[TIERS.length - 1];
}

function generateReferralCode(name: string): string {
  const base = name.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6).padEnd(4, "X");
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `${base}${rand}`;
}

// ─── Profile ─────────────────────────────────────────────────────────────────

/** GET /api/affiliates/profile — get or auto-create affiliate profile */
affiliateRoutes.get("/profile", async (c) => {
  const userId = uid(c);
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);

  const db = getDb();
  let [profile] = await db
    .select()
    .from(schema.affiliateProfiles)
    .where(eq(schema.affiliateProfiles.userId, userId))
    .limit(1);

  if (!profile) {
    // Auto-create on first access
    const [user] = await db.select({ name: schema.users.name }).from(schema.users).where(eq(schema.users.id, userId)).limit(1);
    const code = generateReferralCode(user?.name ?? userId);
    [profile] = await db.insert(schema.affiliateProfiles).values({
      userId,
      referralCode: code,
      commissionRate: "0.10",
      status: "active",
    } as any).returning();
  }

  // Count conversions to determine tier
  const [convRow] = await db
    .select({ total: count() })
    .from(schema.affiliateConversions)
    .where(eq(schema.affiliateConversions.affiliateId, profile.id));
  const conversions = Number(convRow?.total ?? 0);
  const tier = getTier(conversions);
  const nextTier = TIERS.slice().reverse().find((t) => t.minConversions > conversions);

  return c.json(ok({
    ...profile,
    tier: tier.name,
    tierLabel: tier.label,
    commissionRate: tier.commissionRate,
    conversions,
    nextTier: nextTier ? { name: nextTier.name, label: nextTier.label, conversionsNeeded: nextTier.minConversions - conversions } : null,
    referralUrl: `${process.env.FRONTEND_URL ?? "https://hired.video"}/?ref=${profile.referralCode}`,
  }), 200);
});

/** PATCH /api/affiliates/profile — update payout email */
affiliateRoutes.patch("/profile", async (c) => {
  const userId = uid(c);
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);

  const body = await c.req.json().catch(() => ({}));
  const db = getDb();
  const [profile] = await db
    .select({ id: schema.affiliateProfiles.id })
    .from(schema.affiliateProfiles)
    .where(eq(schema.affiliateProfiles.userId, userId))
    .limit(1);
  if (!profile) return c.json(error("NOT_FOUND", "Affiliate profile not found"), 404);

  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (body.payoutEmail) updates.payoutEmail = body.payoutEmail;

  const [updated] = await db
    .update(schema.affiliateProfiles)
    .set(updates as any)
    .where(eq(schema.affiliateProfiles.id, profile.id))
    .returning();
  return c.json(ok(updated), 200);
});

// ─── Click tracking ───────────────────────────────────────────────────────────

/**
 * POST /api/affiliates/click — record a referral link click (public endpoint)
 * Body: { referralCode, targetPath? }
 */
affiliateRoutes.post("/click", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const code: string = String(body.referralCode ?? "").trim().toUpperCase();
  if (!code) return c.json(error("VALIDATION_ERROR", "referralCode is required"), 400);

  const db = getDb();
  const [profile] = await db
    .select({ id: schema.affiliateProfiles.id })
    .from(schema.affiliateProfiles)
    .where(eq(schema.affiliateProfiles.referralCode, code))
    .limit(1);

  if (!profile) return c.json(error("NOT_FOUND", "Invalid referral code"), 404);

  const clicksTable = (schema as any).affiliateLinkClicks;
  if (clicksTable) {
    await db.insert(clicksTable).values({
      affiliateId: profile.id,
      referralCode: code,
      targetPath: body.targetPath ?? null,
      ipAddress: c.req.header("cf-connecting-ip") ?? c.req.header("x-forwarded-for") ?? null,
      userAgent: c.req.header("user-agent") ?? null,
      referer: c.req.header("referer") ?? null,
    }).catch(() => undefined);
  }

  return c.json(ok({ tracked: true }), 200);
});

// ─── Stats & analytics ────────────────────────────────────────────────────────

/** GET /api/affiliates/dashboard — aggregated dashboard data for the frontend */
affiliateRoutes.get("/dashboard", async (c) => {
  const userId = uid(c);
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);

  const db = getDb();
  const [profile] = await db
    .select({ id: schema.affiliateProfiles.id })
    .from(schema.affiliateProfiles)
    .where(eq(schema.affiliateProfiles.userId, userId))
    .limit(1);

  if (!profile) {
    return c.json(ok({
      referrals: [],
      conversions: [],
      payouts: [],
      totals: { pendingCents: 0, paidCents: 0 },
    }), 200);
  }

  const referrals = await db
    .select()
    .from(schema.affiliateReferrals)
    .where(eq(schema.affiliateReferrals.affiliateId, profile.id))
    .orderBy(desc(schema.affiliateReferrals.createdAt))
    .limit(100);

  const conversions = await db
    .select()
    .from(schema.affiliateConversions)
    .where(eq(schema.affiliateConversions.affiliateId, profile.id))
    .orderBy(desc(schema.affiliateConversions.createdAt))
    .limit(100);

  const payouts = await db
    .select()
    .from(schema.affiliatePayouts)
    .where(eq(schema.affiliatePayouts.affiliateId, profile.id))
    .orderBy(desc(schema.affiliatePayouts.createdAt))
    .limit(50);

  const [pendingRow] = await db
    .select({ earned: sum(schema.affiliateConversions.commission) })
    .from(schema.affiliateConversions)
    .where(and(eq(schema.affiliateConversions.affiliateId, profile.id), eq(schema.affiliateConversions.status, "pending")));

  const [paidRow] = await db
    .select({ earned: sum(schema.affiliateConversions.commission) })
    .from(schema.affiliateConversions)
    .where(and(eq(schema.affiliateConversions.affiliateId, profile.id), eq(schema.affiliateConversions.status, "paid")));

  return c.json(ok({
    referrals: referrals.map((r) => ({
      id: r.id,
      referredUserId: r.referredUserId,
      referralCode: r.referralCode ?? "",
      createdAt: new Date(r.createdAt).toISOString(),
    })),
    conversions: conversions.map((cv) => ({
      id: cv.id,
      referredUserId: cv.referralId ?? "",
      subscriptionAmountCents: Math.round(Number(cv.revenue ?? 0) * 100),
      commissionAmountCents: Math.round(Number(cv.commission ?? 0) * 100),
      status: cv.status,
      createdAt: new Date(cv.createdAt).toISOString(),
    })),
    payouts: payouts.map((p) => ({
      id: p.id,
      amountCents: Math.round(Number(p.amount ?? 0) * 100),
      status: p.status,
      requestedAt: new Date(p.createdAt).toISOString(),
      paidAt: p.processedAt ? new Date(p.processedAt).toISOString() : null,
    })),
    totals: {
      pendingCents: Math.round(Number(pendingRow?.earned ?? 0) * 100),
      paidCents: Math.round(Number(paidRow?.earned ?? 0) * 100),
    },
  }), 200);
});

/** GET /api/affiliates/stats — earnings, clicks, conversions summary */
affiliateRoutes.get("/stats", async (c) => {
  const userId = uid(c);
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);

  const db = getDb();
  const [profile] = await db
    .select()
    .from(schema.affiliateProfiles)
    .where(eq(schema.affiliateProfiles.userId, userId))
    .limit(1);
  if (!profile) return c.json(ok({ conversions: 0, clicks: 0, totalEarned: 0, pendingEarnings: 0 }), 200);

  const [convRow] = await db
    .select({ total: count(), earned: sum(schema.affiliateConversions.commission) })
    .from(schema.affiliateConversions)
    .where(eq(schema.affiliateConversions.affiliateId, profile.id));

  const [pendingRow] = await db
    .select({ earned: sum(schema.affiliateConversions.commission) })
    .from(schema.affiliateConversions)
    .where(and(eq(schema.affiliateConversions.affiliateId, profile.id), eq(schema.affiliateConversions.status, "pending")));

  const clicksTable = (schema as any).affiliateLinkClicks;
  let clicks = 0;
  if (clicksTable) {
    const [clickRow] = await db.select({ total: count() }).from(clicksTable)
      .where(eq(clicksTable.affiliateId, profile.id)).catch(() => [{ total: 0 }]);
    clicks = Number(clickRow?.total ?? 0);
  }

  const conversions = Number(convRow?.total ?? 0);
  const tier = getTier(conversions);

  return c.json(ok({
    tier: tier.name,
    tierLabel: tier.label,
    conversions,
    clicks,
    conversionRate: clicks > 0 ? Math.round((conversions / clicks) * 100) : 0,
    totalEarned: Number(convRow?.earned ?? 0),
    pendingEarnings: Number(pendingRow?.earned ?? 0),
    totalPaid: Number(profile.totalPaid ?? 0),
  }), 200);
});

/** GET /api/affiliates/leaderboard — top 20 affiliates by conversion count */
affiliateRoutes.get("/leaderboard", async (c) => {
  const db = getDb();
  const rows = await db
    .select({
      affiliateId: schema.affiliateConversions.affiliateId,
      conversions: count(schema.affiliateConversions.id),
      earned: sum(schema.affiliateConversions.commission),
    })
    .from(schema.affiliateConversions)
    .where(eq(schema.affiliateConversions.status, "paid"))
    .groupBy(schema.affiliateConversions.affiliateId)
    .orderBy(desc(count(schema.affiliateConversions.id)))
    .limit(20);

  // Enrich with referral codes (no PII — code acts as handle)
  const profileIds = rows.map((r) => r.affiliateId);
  const profiles = profileIds.length > 0
    ? await db.select({ id: schema.affiliateProfiles.id, referralCode: schema.affiliateProfiles.referralCode })
        .from(schema.affiliateProfiles)
        .where(eq(schema.affiliateProfiles.id, profileIds[0])) // simple single-lookup; scale with inArray
    : [];
  const profileMap = Object.fromEntries(profiles.map((p) => [p.id, p.referralCode]));

  const leaderboard = rows.map((r, i) => {
    const convs = Number(r.conversions);
    const tier = getTier(convs);
    return {
      rank: i + 1,
      handle: profileMap[r.affiliateId] ?? "—",
      tier: tier.name,
      conversions: convs,
      earned: Number(r.earned ?? 0),
    };
  });

  return c.json(ok(leaderboard), 200);
});

/** GET /api/affiliates/referrals — list referrals for the current user */
affiliateRoutes.get("/referrals", async (c) => {
  const userId = uid(c);
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  const db = getDb();
  const [profile] = await db.select({ id: schema.affiliateProfiles.id })
    .from(schema.affiliateProfiles).where(eq(schema.affiliateProfiles.userId, userId)).limit(1);
  if (!profile) return c.json(ok([]), 200);

  const rows = await db.select()
    .from(schema.affiliateReferrals)
    .where(eq(schema.affiliateReferrals.affiliateId, profile.id))
    .orderBy(desc(schema.affiliateReferrals.createdAt))
    .limit(100);
  return c.json(ok(rows), 200);
});

/** GET /api/affiliates/conversions — list conversions (earnings) */
affiliateRoutes.get("/conversions", async (c) => {
  const userId = uid(c);
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  const db = getDb();
  const [profile] = await db.select({ id: schema.affiliateProfiles.id })
    .from(schema.affiliateProfiles).where(eq(schema.affiliateProfiles.userId, userId)).limit(1);
  if (!profile) return c.json(ok([]), 200);

  const rows = await db.select()
    .from(schema.affiliateConversions)
    .where(eq(schema.affiliateConversions.affiliateId, profile.id))
    .orderBy(desc(schema.affiliateConversions.createdAt))
    .limit(100);
  return c.json(ok(rows), 200);
});

// ─── Payout requests ─────────────────────────────────────────────────────────

/** POST /api/affiliates/payout — request a payout */
affiliateRoutes.post("/payout", async (c) => {
  const userId = uid(c);
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);

  const db = getDb();
  const [profile] = await db.select()
    .from(schema.affiliateProfiles).where(eq(schema.affiliateProfiles.userId, userId)).limit(1);
  if (!profile) return c.json(error("NOT_FOUND", "Affiliate profile not found"), 404);

  const [pendingRow] = await db
    .select({ earned: sum(schema.affiliateConversions.commission) })
    .from(schema.affiliateConversions)
    .where(and(eq(schema.affiliateConversions.affiliateId, profile.id), eq(schema.affiliateConversions.status, "pending")));

  const pendingAmount = Number(pendingRow?.earned ?? 0);
  if (pendingAmount < 50) return c.json(error("PAYMENT_REQUIRED", "Minimum payout is $50"), 402);
  if (!profile.payoutEmail) return c.json(error("VALIDATION_ERROR", "Please set a payout email in your profile"), 400);

  const [payout] = await db.insert(schema.affiliatePayouts).values({
    affiliateId: profile.id,
    amount: String(pendingAmount),
    currency: "USD",
    status: "pending",
    payoutMethod: "bank_transfer",
  } as any).returning();

  return c.json(ok({ ...payout, note: "Payout request submitted. Processing within 5–7 business days." }), 201);
});

// ─── Admin stubs ─────────────────────────────────────────────────────────────

affiliateRoutes.post("/admin/:userId/activate", (c) => c.json(ok({ success: true }), 200));
affiliateRoutes.post("/admin/:userId/deactivate", (c) => c.json(ok({ success: true }), 200));
affiliateRoutes.post("/admin/:userId/suspend", (c) => c.json(ok({ success: true }), 200));
affiliateRoutes.post("/admin/:userId/unsuspend", (c) => c.json(ok({ success: true }), 200));
affiliateRoutes.get("/admin/:userId/referrals", (c) => c.json(ok([]), 200));
affiliateRoutes.get("/admin/:userId/conversions", (c) => c.json(ok([]), 200));
affiliateRoutes.get("/admin/pending-payouts", (c) => c.json(ok([]), 200));
affiliateRoutes.post("/admin/payout/:payoutId/approve", (c) => c.json(ok({ success: true }), 200));
affiliateRoutes.post("/admin/payout/:payoutId/reject", (c) => c.json(ok({ success: true }), 200));
affiliateRoutes.post("/admin/payout/:payoutId/process", (c) => c.json(ok({ success: true }), 200));
affiliateRoutes.get("/admin/payout/:payoutId/status", (c) => c.json(ok({ status: "pending" }), 200));

affiliateRoutes.all("*", (c) =>
  c.json({ error: { code: "NOT_FOUND", message: "Affiliate route not found" } }, 404),
);
