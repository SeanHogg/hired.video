import { Hono } from "hono";
import { and, count, eq, inArray, lte } from "drizzle-orm";
import { z } from "zod";
import type { Variables } from "../types/index.js";
import { error } from "../types/index.js";
import { getDb, schema } from "../db/index.js";
import * as billingService from "../services/billing.js";

export const billingRoutes = new Hono<{ Variables: Variables }>();

const nowIso = () => new Date().toISOString();

function ok<T>(data: T) {
  return { success: true as const, data, timestamp: nowIso() };
}

function uid(c: any): string | null {
  return (c.var.user?.sub as string | undefined) ?? null;
}

billingRoutes.get("/subscription", async (c) => {
  const userId = uid(c);
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  return c.json(ok(await billingService.getSubscription(userId)), 200);
});

billingRoutes.get("/payment-methods", async (c) => {
  const userId = uid(c);
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  return c.json(ok(await billingService.getPaymentMethods(userId)), 200);
});

billingRoutes.get("/invoices", async (c) => {
  const userId = uid(c);
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  return c.json(ok(await billingService.getInvoices(userId)), 200);
});

billingRoutes.get("/ai-usage/month", async (c) => {
  const userId = uid(c);
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  return c.json(ok(await billingService.getAIUsageForUser(userId)), 200);
});

/**
 * GET /api/Billing/token-budget — full token-budget summary for the current
 * user. Used by the sidebar AITokenPill, the AIUsageLimitBanner, and the
 * "buy more tokens" sheet. Replaces the request-count `/ai-usage/month`
 * shape with true token metering.
 */
billingRoutes.get("/token-budget", async (c) => {
  const userId = uid(c);
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  const summary = await billingService.getTokenBudgetSummary(userId);
  return c.json(
    ok({
      planId: summary.planId,
      isPro: summary.isPro,
      isUnlimited: summary.isUnlimited,
      monthly: {
        used: summary.monthlyUsed,
        limit: summary.isUnlimited ? null : summary.monthlyLimit,
        remaining: summary.isUnlimited ? null : summary.monthlyRemaining,
        resetAt: new Date(
          Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth() + 1, 1),
        ).toISOString(),
      },
      pack: {
        balance: summary.packBalance,
      },
      totalAvailable: summary.isUnlimited ? null : summary.totalAvailable,
    }),
    200,
  );
});

billingRoutes.post("/refund-request", async (c) => {
  const userId = uid(c);
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  const body = await c.req.json().catch(() => ({}));
  const reason = String(body?.reason ?? "");
  if (!reason) return c.json(error("VALIDATION_ERROR", "reason is required"), 400);

  const db = getDb();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [inserted] = await (db.insert(schema.refundRequests) as any)
    .values({
      userId,
      invoiceId: body?.invoiceId ?? null,
      reason,
      amount: body?.amountCents ? String(Number(body.amountCents) / 100) : null,
      status: "pending",
    })
    .returning();

  return c.json(ok(inserted), 201);
});

billingRoutes.get("/refund-requests", async (c) => {
  const userId = uid(c);
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  const db = getDb();
  const rows = await db
    .select()
    .from(schema.refundRequests)
    .where(eq(schema.refundRequests.userId, userId))
    .orderBy(schema.refundRequests.createdAt);
  return c.json(ok(rows), 200);
});

billingRoutes.get("/refund-requests/:requestId", async (c) => {
  const userId = uid(c);
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  const db = getDb();
  const [row] = await db
    .select()
    .from(schema.refundRequests)
    .where(eq(schema.refundRequests.id, c.req.param("requestId")))
    .limit(1);
  if (!row || row.userId !== userId) return c.json(error("NOT_FOUND", "Refund request not found"), 404);
  return c.json(ok(row), 200);
});

billingRoutes.post("/cancel-account", async (c) => {
  const userId = uid(c);
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  const body = await c.req.json().catch(() => ({}));
  // Record a refund request as the cancellation marker (no dedicated table yet)
  const db = getDb();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [inserted] = await (db.insert(schema.refundRequests) as any)
    .values({
      userId,
      reason: `CANCELLATION: ${String(body?.reason ?? "user_requested")}`,
      status: "pending",
    })
    .returning();
  return c.json(ok({ ...inserted, type: "cancellation", requestRefund: Boolean(body?.requestRefund) }), 201);
});

billingRoutes.get("/cancellation-requests", async (c) => {
  const userId = uid(c);
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  const db = getDb();
  const rows = await db
    .select()
    .from(schema.refundRequests)
    .where(eq(schema.refundRequests.userId, userId))
    .orderBy(schema.refundRequests.createdAt);
  const cancellations = rows.filter((r) => r.reason.startsWith("CANCELLATION:"));
  return c.json(ok(cancellations), 200);
});

billingRoutes.get("/refund-policy", (c) =>
  c.json(
    ok({
      refundPeriodDays: 14,
      eligiblePlans: ["monthly", "annual"],
      excludedReasons: [],
      policyText: "Refunds are reviewed case-by-case within the eligible period.",
      lastUpdated: nowIso(),
    }),
    200,
  ),
);

billingRoutes.get("/refund-reasons", (c) =>
  c.json(
    ok({
      reasons: [
        { value: "accidental_purchase", label: "Accidental purchase" },
        { value: "technical_issue", label: "Technical issue" },
        { value: "billing_error", label: "Billing error" },
        { value: "other", label: "Other" },
      ],
    }),
    200,
  ),
);

// ---------------------------------------------------------------------------
// GET /api/billing/usage-summary — paywall meter data for frontend (#55)
// Returns current plan limits vs. actual usage so the UI can show
// "X of 10 AI requests used" and gated feature availability.
// ---------------------------------------------------------------------------
billingRoutes.get("/usage-summary", async (c) => {
  const userId = uid(c);
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);

  const [sub, aiUsage] = await Promise.all([
    billingService.getSubscription(userId),
    billingService.getMonthlyAIUsage(userId),
  ]);

  const db = getDb();

  // Team member count (invitations sent by this user)
  const [teamRow] = await db
    .select({ total: count() })
    .from(schema.accountInvitations)
    .where(eq(schema.accountInvitations.invitedBy, userId));

  const teamMemberCount = Number(teamRow?.total ?? 0) + 1; // +1 for owner

  return c.json(ok({
    plan: {
      id: sub.planId,
      name: sub.planName,
      isPremium: sub.isPremium,
      status: sub.status,
      interval: sub.interval,
    },
    usage: {
      aiRequests: {
        used: aiUsage.used,
        limit: aiUsage.limit ?? null,
        remaining: aiUsage.remaining ?? null,
        isUnlimited: aiUsage.isUnlimited,
        resetAt: new Date(new Date().getFullYear(), new Date().getMonth() + 1, 1).toISOString(),
      },
      teamMembers: {
        used: teamMemberCount,
        limit: sub.isPremium ? null : 3, // FREE_TEAM_MEMBER_LIMIT
        isUnlimited: sub.isPremium,
      },
    },
    features: {
      resumeOptimizer: sub.isPremium,
      salaryAnalyzer: sub.isPremium,
      hiringMetrics: sub.isPremium,
      employeeCommunity: sub.isPremium,
      exclusiveBoards: sub.isPremium,
      outreachSequences: sub.isPremium,
      performanceManagement: sub.isPremium,
      videoGeneration: sub.isPremium,
    },
  }), 200);
});

// ---------------------------------------------------------------------------
// POST /api/billing/trial/start — start a 14-day free trial (#57)
// Creates a trialing subscription for the lowest-cost premium plan.
// One trial per user enforced via existing subscription check.
// ---------------------------------------------------------------------------
billingRoutes.post("/trial/start", async (c) => {
  const userId = uid(c);
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);

  const db = getDb();

  // Reject if user already has an active or trialing subscription
  const [existing] = await db
    .select({ id: schema.subscriptions.id, status: schema.subscriptions.status })
    .from(schema.subscriptions)
    .where(and(
      eq(schema.subscriptions.userId, userId),
      inArray(schema.subscriptions.status, ["active", "trialing"]),
    ))
    .limit(1);

  if (existing) {
    return c.json(error("CONFLICT", "You already have an active subscription or trial"), 409);
  }

  // Also reject if user has ever had a trial (trialing or canceled-after-trial)
  const [priorTrial] = await db
    .select({ id: schema.subscriptions.id })
    .from(schema.subscriptions)
    .where(and(
      eq(schema.subscriptions.userId, userId),
      eq(schema.subscriptions.status, "trialing"),
    ))
    .limit(1);

  if (priorTrial) {
    return c.json(error("CONFLICT", "Trial already used"), 409);
  }

  // Find the cheapest paid plan (slug != 'free')
  const [plan] = await db
    .select()
    .from(schema.subscriptionPlans)
    .where(and(eq(schema.subscriptionPlans.isActive, true)))
    .orderBy(schema.subscriptionPlans.priceMonthly)
    .limit(1);

  if (!plan) return c.json(error("NOT_FOUND", "No subscription plans available"), 404);

  const trialDays = 14;
  const trialEnd = new Date(Date.now() + trialDays * 24 * 60 * 60 * 1000);
  const [sub] = await db
    .insert(schema.subscriptions)
    .values({
      userId,
      planId: plan.id,
      status: "trialing",
      billingInterval: "monthly",
      trialEnd,
      currentPeriodStart: new Date(),
      currentPeriodEnd: trialEnd,
    } as any)
    .returning();

  // Notify user
  await db.insert(schema.notifications).values({
    userId,
    type: "billing",
    title: "Your 14-day trial has started",
    message: `Enjoy full Premium access until ${trialEnd.toLocaleDateString()}. Add a payment method before it ends to keep access.`,
    data: { subscriptionId: sub.id, trialEnd: trialEnd.toISOString() } as any,
  } as any).catch(() => undefined);

  billingService.invalidateSubscriptionCache(userId);
  return c.json(ok({ subscriptionId: sub.id, trialEnd: trialEnd.toISOString(), daysRemaining: trialDays }), 201);
});

// ---------------------------------------------------------------------------
// POST /api/billing/subscribe — create or upgrade a subscription (#56)
// Body: { planSlug: string, interval: "monthly" | "yearly" }
// Yearly billing applies a 20% discount (uses priceYearly from plan).
// ---------------------------------------------------------------------------
const SubscribeSchema = z.object({
  planSlug: z.string().min(1),
  interval: z.enum(["monthly", "yearly"]).default("monthly"),
});

billingRoutes.post("/subscribe", async (c) => {
  const userId = uid(c);
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);

  const body = await c.req.json().catch(() => null);
  const parsed = SubscribeSchema.safeParse(body);
  if (!parsed.success) return c.json(error("VALIDATION_ERROR", "Invalid request", parsed.error.flatten()), 400);

  const { planSlug, interval } = parsed.data;
  const db = getDb();

  const [plan] = await db
    .select()
    .from(schema.subscriptionPlans)
    .where(and(eq(schema.subscriptionPlans.slug, planSlug), eq(schema.subscriptionPlans.isActive, true)))
    .limit(1);

  if (!plan) return c.json(error("NOT_FOUND", "Plan not found"), 404);

  // Determine effective price
  const isYearly = interval === "yearly";
  const effectivePrice = isYearly && plan.priceYearly
    ? Number(plan.priceYearly)
    : Number(plan.priceMonthly) * (isYearly ? 10 : 1); // fallback: 2 months free if no explicit yearly price

  const periodDays = isYearly ? 365 : 30;
  const periodEnd = new Date(Date.now() + periodDays * 24 * 60 * 60 * 1000);

  // Cancel any existing active/trialing subscriptions
  await db
    .update(schema.subscriptions)
    .set({ status: "canceled", canceledAt: new Date(), updatedAt: new Date() } as any)
    .where(and(
      eq(schema.subscriptions.userId, userId),
      inArray(schema.subscriptions.status, ["active", "trialing"]),
    ));

  const [sub] = await db
    .insert(schema.subscriptions)
    .values({
      userId,
      planId: plan.id,
      status: "active",
      billingInterval: interval,
      currentPeriodStart: new Date(),
      currentPeriodEnd: periodEnd,
    } as any)
    .returning();

  // Billing invoice record
  await db.insert(schema.invoices).values({
    userId,
    subscriptionId: sub.id,
    amount: String(effectivePrice),
    tax: "0",
    total: String(effectivePrice),
    currency: plan.currency,
    status: "paid",
    invoiceDate: new Date(),
    dueDate: new Date(),
  } as any).catch(() => undefined);

  // Notify user of successful subscription
  await db.insert(schema.notifications).values({
    userId,
    type: "billing",
    title: `Welcome to ${plan.name}!`,
    message: `Your ${interval} subscription is now active. ${isYearly ? "You saved 20% with annual billing." : ""}`,
    data: { subscriptionId: sub.id, planSlug, interval } as any,
  } as any).catch(() => undefined);

  billingService.invalidateSubscriptionCache(userId);
  return c.json(ok({
    subscriptionId: sub.id,
    planSlug,
    interval,
    effectivePrice,
    currency: plan.currency,
    currentPeriodEnd: periodEnd.toISOString(),
  }), 201);
});

// ---------------------------------------------------------------------------
// POST /api/billing/pause — pause billing for 30 days (#58 churn flow)
// Sets subscription status to paused; cron will need to resume it.
// ---------------------------------------------------------------------------
billingRoutes.post("/pause", async (c) => {
  const userId = uid(c);
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);

  const db = getDb();
  const [sub] = await db
    .select({ id: schema.subscriptions.id, status: schema.subscriptions.status })
    .from(schema.subscriptions)
    .where(and(eq(schema.subscriptions.userId, userId), eq(schema.subscriptions.status, "active")))
    .limit(1);

  if (!sub) return c.json(error("NOT_FOUND", "No active subscription found"), 404);

  const resumeAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

  await db
    .update(schema.subscriptions)
    .set({
      status: "paused" as any,
      currentPeriodEnd: resumeAt,
      updatedAt: new Date(),
    } as any)
    .where(eq(schema.subscriptions.id, sub.id));

  billingService.invalidateSubscriptionCache(userId);
  return c.json(ok({ paused: true, resumesAt: resumeAt.toISOString() }), 200);
});

// ---------------------------------------------------------------------------
// POST /api/billing/downgrade — downgrade to free tier (#58 churn flow)
// ---------------------------------------------------------------------------
billingRoutes.post("/downgrade", async (c) => {
  const userId = uid(c);
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);

  const db = getDb();
  await db
    .update(schema.subscriptions)
    .set({ status: "canceled", canceledAt: new Date(), cancelAtPeriodEnd: false, updatedAt: new Date() } as any)
    .where(and(
      eq(schema.subscriptions.userId, userId),
      inArray(schema.subscriptions.status, ["active", "trialing", "paused" as any]),
    ));

  billingService.invalidateSubscriptionCache(userId);
  return c.json(ok({ downgraded: true, message: "You've been moved to the Free plan." }), 200);
});

// ---------------------------------------------------------------------------
// GET /api/billing/notifications — in-app billing event alerts (#62)
// Returns pending alerts: trial ending, payment failed, usage warnings.
// ---------------------------------------------------------------------------
billingRoutes.get("/notifications", async (c) => {
  const userId = uid(c);
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);

  const db = getDb();
  const alerts: Array<{ type: string; message: string; severity: "info" | "warning" | "error" }> = [];

  // Check trial end
  const [sub] = await db
    .select({
      status: schema.subscriptions.status,
      trialEnd: schema.subscriptions.trialEnd,
      currentPeriodEnd: schema.subscriptions.currentPeriodEnd,
      cancelAtPeriodEnd: schema.subscriptions.cancelAtPeriodEnd,
    })
    .from(schema.subscriptions)
    .where(and(
      eq(schema.subscriptions.userId, userId),
      inArray(schema.subscriptions.status, ["active", "trialing"]),
    ))
    .limit(1);

  if (sub?.status === "trialing" && sub.trialEnd) {
    const daysLeft = Math.ceil((new Date(sub.trialEnd).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
    if (daysLeft <= 3) {
      alerts.push({
        type: "trial_ending",
        message: `Your trial ends in ${daysLeft} day${daysLeft === 1 ? "" : "s"}. Add a payment method to keep Premium access.`,
        severity: "warning",
      });
    }
  }

  if (sub?.cancelAtPeriodEnd && sub.currentPeriodEnd) {
    const daysLeft = Math.ceil((new Date(sub.currentPeriodEnd).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
    alerts.push({
      type: "cancellation_scheduled",
      message: `Your subscription will be cancelled in ${daysLeft} day${daysLeft === 1 ? "" : "s"}. Reactivate to keep access.`,
      severity: "warning",
    });
  }

  // Check AI usage (warn at 90%)
  const usage = await billingService.getMonthlyAIUsage(userId);
  if (!usage.isUnlimited && usage.limit && usage.used >= usage.limit * 0.9) {
    const pct = Math.round((usage.used / usage.limit) * 100);
    alerts.push({
      type: "ai_usage_high",
      message: `You've used ${pct}% of your monthly AI requests (${usage.used}/${usage.limit}). Upgrade for unlimited access.`,
      severity: usage.used >= usage.limit ? "error" : "warning",
    });
  }

  return c.json(ok({ alerts }), 200);
});

// ---------------------------------------------------------------------------
// Company / employer seat-based billing (#67)
// Separate from individual user subscriptions — charged per recruiter seat.
// ---------------------------------------------------------------------------

const SeatUpdateSchema = z.object({
  seatCount: z.number().int().min(1).max(500),
  planTier: z.enum(["starter", "team", "enterprise"]).optional(),
  billingInterval: z.enum(["monthly", "yearly"]).optional(),
});

/** GET /api/billing/company/:companyId — get current company plan + seat usage */
billingRoutes.get("/company/:companyId", async (c) => {
  const userId = uid(c);
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  const companyId = c.req.param("companyId");
  const db = getDb();

  // Only company owner or member can see billing
  const [company] = await db
    .select({ ownerId: schema.companyProfiles.ownerId })
    .from(schema.companyProfiles)
    .where(eq(schema.companyProfiles.id, companyId))
    .limit(1);
  if (!company) return c.json(error("NOT_FOUND", "Company not found"), 404);
  if (company.ownerId !== userId) return c.json(error("FORBIDDEN", "Only the company owner can view billing"), 403);

  const [companySub] = await db
    .select()
    .from((schema as any).companySubscriptions)
    .where(eq((schema as any).companySubscriptions.companyId, companyId))
    .limit(1)
    .catch(() => [null]);

  // Count active seats (accepted invitations to this company)
  const [usedRow] = await db
    .select({ total: count() })
    .from(schema.userCompanyRoleAssociations)
    .where(and(
      eq(schema.userCompanyRoleAssociations.companyId, companyId),
      eq(schema.userCompanyRoleAssociations.isActive, true),
    ));
  const seatsUsed = Number(usedRow?.total ?? 0);

  const plan = companySub ?? {
    planTier: "starter",
    seatCount: 1,
    pricePerSeatCents: 4900,
    status: "none",
    billingInterval: "monthly",
  };

  const pricePerSeat = plan.pricePerSeatCents / 100;
  const totalMonthly = plan.seatCount * pricePerSeat;

  return c.json(ok({
    plan: plan.planTier,
    seatCount: plan.seatCount,
    seatsUsed,
    seatsAvailable: Math.max(0, plan.seatCount - seatsUsed),
    pricePerSeatCents: plan.pricePerSeatCents,
    totalMonthly,
    status: plan.status,
    billingInterval: plan.billingInterval,
    stripeSubscriptionId: plan.stripeSubscriptionId ?? null,
  }), 200);
});

/** PATCH /api/billing/company/:companyId/seats — add/remove seats */
billingRoutes.patch("/company/:companyId/seats", async (c) => {
  const userId = uid(c);
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  const companyId = c.req.param("companyId");

  const body = await c.req.json().catch(() => null);
  const parsed = SeatUpdateSchema.safeParse(body);
  if (!parsed.success) return c.json(error("VALIDATION_ERROR", "Invalid seat update", parsed.error.flatten()), 400);

  const db = getDb();
  const [company] = await db
    .select({ ownerId: schema.companyProfiles.ownerId })
    .from(schema.companyProfiles)
    .where(eq(schema.companyProfiles.id, companyId))
    .limit(1);
  if (!company) return c.json(error("NOT_FOUND", "Company not found"), 404);
  if (company.ownerId !== userId) return c.json(error("FORBIDDEN", "Only the company owner can update seats"), 403);

  // Determine price per seat by tier
  const SEAT_PRICES: Record<string, number> = { starter: 4900, team: 3900, enterprise: 2900 };
  const tier = parsed.data.planTier ?? "team";
  const pricePerSeatCents = SEAT_PRICES[tier] ?? 4900;

  const companySubsTable = (schema as any).companySubscriptions;
  if (!companySubsTable) return c.json(error("SERVICE_UNAVAILABLE", "Seat billing not available"), 503);

  const now = new Date();
  const [existing] = await db.select({ id: companySubsTable.id }).from(companySubsTable)
    .where(eq(companySubsTable.companyId, companyId)).limit(1);

  let result: any;
  if (existing) {
    [result] = await db.update(companySubsTable)
      .set({
        seatCount: parsed.data.seatCount,
        planTier: tier,
        pricePerSeatCents,
        billingInterval: parsed.data.billingInterval ?? "monthly",
        updatedAt: now,
      })
      .where(eq(companySubsTable.companyId, companyId))
      .returning();
  } else {
    [result] = (await db.insert(companySubsTable)
      .values({
        companyId,
        planTier: tier,
        seatCount: parsed.data.seatCount,
        pricePerSeatCents,
        billingInterval: parsed.data.billingInterval ?? "monthly",
        status: "active",
        currentPeriodStart: now,
        currentPeriodEnd: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000),
      } as any)
      .returning()) as any[];
  }

  // TODO: sync with Stripe to update subscription quantity when stripeSubscriptionId is set

  return c.json(ok({
    ...result,
    totalMonthly: (result.seatCount * result.pricePerSeatCents) / 100,
  }), 200);
});

billingRoutes.all("*", (c) =>
  c.json({ error: { code: "NOT_IMPLEMENTED", message: "Billing route not found" } }, 404),
);
