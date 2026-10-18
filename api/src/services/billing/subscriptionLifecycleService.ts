/**
 * Individual subscription lifecycle use cases behind /api/billing:
 * trial start, subscribe/upgrade, pause, downgrade, plus the read models
 * (usage invoices, usage summary, billing alerts). Each write busts the
 * cached effective plan so the change is visible immediately.
 */
import { getDb } from "../../db/index.js";
import { DomainError } from "../../domains/errors.js";
import { buildRepos } from "../../repositories/index.js";
import { SubscriptionsRepository } from "../../repositories/subscriptionsRepository.js";
import { InvoicesRepository } from "../../repositories/invoicesRepository.js";
import { PlatformRepository } from "../../repositories/platformRepository.js";
import { UsageInvoicesRepository } from "../../repositories/usageInvoicesRepository.js";
import { emitNotification } from "../notifications/notificationService.js";
import * as billingService from "./BillingService.js";
import { TIER_COPY } from "../../../../shared/tier-copy.js";
import { ANNUAL_DISCOUNT_RATE, yearlyPriceFromMonthly } from "../../../../shared/pricing.js";
import type { UsageInvoice } from "../../../../shared/usage-statement.js";

const DAY_MS = 24 * 60 * 60 * 1000;
const TRIAL_DAYS = 14;

/** Best-effort billing notification through the single dispatcher, so the
 *  bell row, preference-gated push and email all apply. */
async function notifyBilling(
  userId: string,
  n: { title: string; message: string; extraData: Record<string, unknown> },
): Promise<void> {
  await emitNotification(
    { repos: buildRepos(getDb()) },
    { recipientIds: [userId], type: "billing", actor: null, url: "/settings?tab=billing", ...n },
  ).catch(() => undefined);
}

const subscriptionsRepo = () => new SubscriptionsRepository(getDb());

/** All closed usage invoices for the user (paid + Free $0), newest first. */
export async function listUsageInvoices(userId: string): Promise<UsageInvoice[]> {
  const rows = await new UsageInvoicesRepository(getDb()).listForUser(userId);
  return rows.map((row) => ({
    id: row.id,
    statementId: row.statementId,
    userId: row.userId,
    periodStart: row.periodStart.toISOString(),
    periodEnd: row.periodEnd.toISOString(),
    plan: row.plan as UsageInvoice["plan"],
    invoiceNumber: row.invoiceNumber,
    totalCents: row.totalCents,
    currency: row.currency,
    status: row.status as UsageInvoice["status"],
    emailSentAt: row.emailSentAt ? row.emailSentAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
  }));
}

/** Paywall meter data: plan, AI-request + team-member usage, gated features (#55). */
export async function getUsageSummary(userId: string) {
  const [sub, aiUsage, invitationsSent] = await Promise.all([
    billingService.getSubscription(userId),
    billingService.getMonthlyAIUsage(userId),
    new PlatformRepository(getDb()).countInvitationsSentBy(userId),
  ]);
  const teamMemberCount = invitationsSent + 1; // +1 for owner

  return {
    plan: {
      id: sub.planId,
      name: sub.planName,
      isPro: sub.isPro,
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
        limit: sub.isPro ? null : 3, // FREE_TEAM_MEMBER_LIMIT
        isUnlimited: sub.isPro,
      },
    },
    features: {
      resumeOptimizer: sub.isPro,
      salaryAnalyzer: sub.isPro,
      hiringMetrics: sub.isPro,
      employeeCommunity: sub.isPro,
      exclusiveBoards: sub.isPro,
      outreachSequences: sub.isPro,
      performanceManagement: sub.isPro,
      videoGeneration: sub.isPro,
    },
  };
}

/** Start a 14-day trial on the cheapest active plan — one trial per user (#57). */
export async function startTrial(userId: string) {
  const subs = subscriptionsRepo();

  // Reject if user already has an active or trialing subscription
  if (await subs.findActiveByUserId(userId)) {
    throw new DomainError(409, "CONFLICT", "You already have an active subscription or trial");
  }
  // Reject if the user has EVER had a trial. The signal is a non-null
  // `trialEnd` on ANY prior subscription, regardless of current status — a
  // user who started then canceled a trial has status 'canceled'. (#2190)
  if (await subs.hasEverTrialed(userId)) {
    throw new DomainError(409, "CONFLICT", "Trial already used");
  }

  const plan = await subs.findCheapestActivePlan();
  if (!plan) throw new DomainError(404, "NOT_FOUND", "No subscription plans available");

  const trialEnd = new Date(Date.now() + TRIAL_DAYS * DAY_MS);
  const sub = await subs.insertSubscription({
    userId,
    planId: plan.id,
    status: "trialing",
    billingInterval: "monthly",
    trialEnd,
    currentPeriodStart: new Date(),
    currentPeriodEnd: trialEnd,
  } as any);

  await notifyBilling(userId, {
    title: "Your 14-day trial has started",
    message: TIER_COPY.trialStarted(trialEnd.toLocaleDateString()),
    extraData: { subscriptionId: sub.id, trialEnd: trialEnd.toISOString() },
  });

  billingService.invalidateSubscriptionCache(userId);
  return { subscriptionId: sub.id, trialEnd: trialEnd.toISOString(), daysRemaining: TRIAL_DAYS };
}

/** Create or upgrade a subscription (#56). Yearly uses priceYearly, or the
 *  canonical annual-discount helper (true 20% off) when the plan has none. */
export async function subscribeToPlan(userId: string, planSlug: string, interval: "monthly" | "yearly") {
  const subs = subscriptionsRepo();
  const plan = await subs.findActivePlanBySlug(planSlug);
  if (!plan) throw new DomainError(404, "NOT_FOUND", "Plan not found");

  const isYearly = interval === "yearly";
  const effectivePrice = isYearly
    ? (plan.priceYearly ? Number(plan.priceYearly) : yearlyPriceFromMonthly(Number(plan.priceMonthly)))
    : Number(plan.priceMonthly);
  const periodEnd = new Date(Date.now() + (isYearly ? 365 : 30) * DAY_MS);

  // Cancel any existing active/trialing subscriptions
  await subs.cancelForUserInStatuses(userId, ["active", "trialing"]);

  const sub = await subs.insertSubscription({
    userId,
    planId: plan.id,
    status: "active",
    billingInterval: interval,
    currentPeriodStart: new Date(),
    currentPeriodEnd: periodEnd,
  } as any);

  // Billing invoice record (best-effort). Only real `invoices` columns;
  // a "paid" invoice stamps `paidAt`.
  const paidNow = new Date();
  await new InvoicesRepository(getDb()).insertInvoice({
    userId,
    subscriptionId: sub.id,
    total: String(effectivePrice),
    currency: plan.currency,
    status: "paid",
    paidAt: paidNow,
    dueDate: paidNow,
  } as any).catch(() => undefined);

  await notifyBilling(userId, {
    title: `Welcome to ${plan.name}!`,
    message: `Your ${interval} subscription is now active. ${isYearly ? `You saved ${Math.round(ANNUAL_DISCOUNT_RATE * 100)}% with annual billing.` : ""}`,
    extraData: { subscriptionId: sub.id, planSlug, interval },
  });

  billingService.invalidateSubscriptionCache(userId);
  return {
    subscriptionId: sub.id,
    planSlug,
    interval,
    effectivePrice,
    currency: plan.currency,
    currentPeriodEnd: periodEnd.toISOString(),
  };
}

/** Pause the active subscription for 30 days (#58 churn flow). */
export async function pauseSubscription(userId: string) {
  const subs = subscriptionsRepo();
  const sub = await subs.findFirstByUserAndStatus(userId, "active");
  if (!sub) throw new DomainError(404, "NOT_FOUND", "No active subscription found");

  const resumeAt = new Date(Date.now() + 30 * DAY_MS);
  await subs.updateSubscriptionById(sub.id, { status: "paused" as any, currentPeriodEnd: resumeAt });

  billingService.invalidateSubscriptionCache(userId);
  return { paused: true, resumesAt: resumeAt.toISOString() };
}

/** Move the user to the Free tier (#58 churn flow). */
export async function downgradeToFree(userId: string) {
  await subscriptionsRepo().cancelForUserInStatuses(userId, ["active", "trialing", "paused"], { cancelAtPeriodEnd: false });
  billingService.invalidateSubscriptionCache(userId);
  return { downgraded: true, message: "You've been moved to the Free plan." };
}

export type BillingAlert = { type: string; message: string; severity: "info" | "warning" | "error" };

/** Pending in-app billing alerts: trial ending, scheduled cancellation, AI usage (#62). */
export async function getBillingAlerts(userId: string): Promise<BillingAlert[]> {
  const alerts: BillingAlert[] = [];
  const sub = await subscriptionsRepo().findActiveByUserId(userId);

  if (sub?.status === "trialing" && sub.trialEnd) {
    const daysLeft = Math.ceil((new Date(sub.trialEnd).getTime() - Date.now()) / DAY_MS);
    if (daysLeft <= 3) {
      alerts.push({ type: "trial_ending", message: TIER_COPY.trialEndingSoon({ daysLeft }), severity: "warning" });
    }
  }

  if (sub?.cancelAtPeriodEnd && sub.currentPeriodEnd) {
    const daysLeft = Math.ceil((new Date(sub.currentPeriodEnd).getTime() - Date.now()) / DAY_MS);
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

  return alerts;
}
