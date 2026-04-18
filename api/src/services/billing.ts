import { and, eq, gte, inArray, lt, sql, sum } from "drizzle-orm";
import { getDb, schema } from "../db/index.js";
import type {
  AIUsageMonthDTO,
  InvoiceDTO,
  PaymentMethodDTO,
  SubscriptionSummaryDTO,
  TokenBudgetDTO,
} from "../../../shared/billing.js";
import {
  FREE_AI_MONTHLY_TOKENS,
  PRO_AI_MONTHLY_TOKENS,
} from "../../../shared/pricing.js";

const {
  subscriptions,
  subscriptionPlans,
  paymentMethods,
  invoices,
  aiUsageRecords,
  userTokenBalance,
  tokenPackPurchases,
  users,
} = schema;

// ---------------------------------------------------------------------------
// Subscription cache (#8)
// Two-layer: (1) in-process Map (survives within a Worker instance, ~seconds),
// (2) Cloudflare KV when KV_CACHE binding is present (survives across instances, 60s TTL).
// To enable KV: add [[kv_namespaces]] binding "KV_CACHE" in wrangler.toml.
// ---------------------------------------------------------------------------
const _subCache = new Map<string, { value: SubscriptionSummaryDTO; expiresAt: number }>();
const SUB_CACHE_TTL_MS = 60_000; // 60 seconds

function getCachedSubscription(userId: string): SubscriptionSummaryDTO | null {
  const entry = _subCache.get(userId);
  if (entry && Date.now() < entry.expiresAt) return entry.value;
  _subCache.delete(userId);
  return null;
}

function setCachedSubscription(userId: string, value: SubscriptionSummaryDTO): void {
  _subCache.set(userId, { value, expiresAt: Date.now() + SUB_CACHE_TTL_MS });
  // Also write to KV if binding is available
  const kv = (globalThis as any).__ENV?.KV_CACHE as KVNamespace | undefined;
  if (kv) {
    kv.put(`sub:${userId}`, JSON.stringify(value), { expirationTtl: 60 }).catch(() => undefined);
  }
}

/** Call this whenever a subscription changes (upgrade, cancel, trial start) to bust the cache. */
export function invalidateSubscriptionCache(userId: string): void {
  _subCache.delete(userId);
  const kv = (globalThis as any).__ENV?.KV_CACHE as KVNamespace | undefined;
  if (kv) {
    kv.delete(`sub:${userId}`).catch(() => undefined);
  }
}

export async function getSubscription(userId: string): Promise<SubscriptionSummaryDTO> {
  // Check in-process cache first, then KV
  const cached = getCachedSubscription(userId);
  if (cached) return cached;

  const kv = (globalThis as any).__ENV?.KV_CACHE as KVNamespace | undefined;
  if (kv) {
    const kvVal = await kv.get(`sub:${userId}`, "json").catch(() => null) as SubscriptionSummaryDTO | null;
    if (kvVal) {
      setCachedSubscription(userId, kvVal); // warm in-process cache too
      return kvVal;
    }
  }

  // Admin and SuperAdmin roles are treated as premium regardless of
  // whether they have a subscription row. Check the user's role before
  // querying the subscriptions table.
  const db = getDb();
  const [userRow] = await db
    .select({ role: users.role })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  const isAdminRole = userRow?.role === "SuperAdmin" || userRow?.role === "Admin";

  const [row] = await db
    .select({
      planSlug: subscriptionPlans.slug,
      planName: subscriptionPlans.name,
      priceMonthly: subscriptionPlans.priceMonthly,
      currency: subscriptionPlans.currency,
      status: subscriptions.status,
      billingInterval: subscriptions.billingInterval,
      cancelAtPeriodEnd: subscriptions.cancelAtPeriodEnd,
    })
    .from(subscriptions)
    .innerJoin(subscriptionPlans, eq(subscriptions.planId, subscriptionPlans.id))
    .where(and(eq(subscriptions.userId, userId), inArray(subscriptions.status, ["active", "trialing"])))
    .limit(1);

  if (!row) {
    const freeResult: SubscriptionSummaryDTO = {
      planId: isAdminRole ? "admin" : "free",
      planName: isAdminRole ? "Admin" : "Free",
      isPremium: isAdminRole,
      price: 0,
      currency: "USD",
      interval: "month",
      status: "active",
      cancelAtPeriodEnd: false,
    };
    setCachedSubscription(userId, freeResult);
    return freeResult;
  }

  const result: SubscriptionSummaryDTO = {
    planId: row.planSlug,
    planName: row.planName,
    isPremium: row.planSlug !== "free" || row.status === "trialing",
    price: Number(row.priceMonthly),
    currency: row.currency,
    interval: row.billingInterval === "yearly" ? "year" : "month",
    status: row.status as SubscriptionSummaryDTO["status"],
    cancelAtPeriodEnd: row.cancelAtPeriodEnd,
  };
  setCachedSubscription(userId, result);
  return result;
}

export async function getPaymentMethods(userId: string): Promise<PaymentMethodDTO[]> {
  const db = getDb();
  const rows = await db
    .select()
    .from(paymentMethods)
    .where(eq(paymentMethods.userId, userId));

  return rows.map((r) => ({
    id: r.id,
    type: (r.type as PaymentMethodDTO["type"]) ?? "card",
    brand: r.brand ?? undefined,
    last4: r.last4 ?? undefined,
    expiryMonth: r.expiryMonth ?? undefined,
    expiryYear: r.expiryYear ?? undefined,
    isDefault: r.isDefault,
  }));
}

export async function getInvoices(userId: string): Promise<InvoiceDTO[]> {
  const db = getDb();
  const rows = await db
    .select()
    .from(invoices)
    .where(eq(invoices.userId, userId))
    .orderBy(invoices.createdAt);

  return rows.map((r) => ({
    id: r.id,
    number: r.stripeInvoiceId ?? r.id.slice(0, 8).toUpperCase(),
    status: (r.status as InvoiceDTO["status"]) ?? "paid",
    amount: Number(r.total),
    tax: 0,
    total: Number(r.total),
    currency: r.currency,
    invoiceDate: r.createdAt.toISOString(),
    dueDate: r.dueDate?.toISOString() ?? r.createdAt.toISOString(),
  }));
}

// ---------------------------------------------------------------------------
// Token usage helpers (true token metering, replaces request-count gate)
// ---------------------------------------------------------------------------

/** Sum of `totalTokens` debited from the monthly bucket for the current
 *  calendar month (UTC). Pack-debited tokens are excluded — they're tracked
 *  separately in `userTokenBalance.lifetimeConsumed`. */
async function getMonthlyTokensUsed(userId: string): Promise<number> {
  const db = getDb();
  const now = new Date();
  const periodStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const periodEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));

  const [row] = await db
    .select({ used: sum(aiUsageRecords.totalTokens) })
    .from(aiUsageRecords)
    .where(
      and(
        eq(aiUsageRecords.userId, userId),
        eq(aiUsageRecords.source, "monthly"),
        gte(aiUsageRecords.createdAt, periodStart),
        lt(aiUsageRecords.createdAt, periodEnd),
      ),
    );

  return Number(row?.used ?? 0);
}

/**
 * Composite token-budget summary used by both the gate check and the
 * frontend pill / banner. Returns the user's monthly allowance + spend,
 * the purchased pack balance, and the total tokens still available across
 * both buckets.
 */
export interface TokenBudgetSummary {
  /** Plan slug — "free" | "pro" | "admin" | "enterprise". */
  planId: string;
  isPro: boolean;
  /** Monthly tokens included in the current plan. */
  monthlyLimit: number;
  /** Monthly tokens used so far this calendar month. */
  monthlyUsed: number;
  monthlyRemaining: number;
  /** Tokens available from purchased one-off packs (no expiry). */
  packBalance: number;
  /** monthlyRemaining + packBalance — what the gate checks against. */
  totalAvailable: number;
  /** True for SuperAdmin / Admin internal users. Bypass all gates. */
  isUnlimited: boolean;
}

export async function getTokenBudgetSummary(userId: string): Promise<TokenBudgetSummary> {
  const sub = await getSubscription(userId);

  // Admin / SuperAdmin / "admin" plan id are internal users — unlimited.
  const db = getDb();
  const [userRow] = await db
    .select({ role: users.role })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  const isInternal = userRow?.role === "SuperAdmin" || userRow?.role === "Admin";
  const isPro = sub.isPremium && !isInternal;

  if (isInternal) {
    // Internal users have no cap but we still record and surface their
    // actual spend so they (and we) can audit consumption. `isUnlimited`
    // stays true so the gate short-circuits and remaining/total render as
    // ∞ — only `monthlyUsed` is authoritative for these accounts.
    const monthlyUsed = await getMonthlyTokensUsed(userId);
    return {
      planId: sub.planId,
      isPro: false,
      monthlyLimit: Number.POSITIVE_INFINITY,
      monthlyUsed,
      monthlyRemaining: Number.POSITIVE_INFINITY,
      packBalance: 0,
      totalAvailable: Number.POSITIVE_INFINITY,
      isUnlimited: true,
    };
  }

  const monthlyLimit = isPro ? PRO_AI_MONTHLY_TOKENS : FREE_AI_MONTHLY_TOKENS;
  const monthlyUsed = await getMonthlyTokensUsed(userId);
  const monthlyRemaining = Math.max(0, monthlyLimit - monthlyUsed);

  const [balanceRow] = await db
    .select({ balance: userTokenBalance.balance })
    .from(userTokenBalance)
    .where(eq(userTokenBalance.userId, userId))
    .limit(1);
  const packBalance = balanceRow?.balance ?? 0;

  return {
    planId: sub.planId,
    isPro,
    monthlyLimit,
    monthlyUsed,
    monthlyRemaining,
    packBalance,
    totalAvailable: monthlyRemaining + packBalance,
    isUnlimited: false,
  };
}

/**
 * Record an AI call to the audit log AND debit the right bucket. Call this
 * AFTER the LLM call returns successfully — it uses the actual prompt/
 * completion token counts from OpenRouter's `usage` field, not estimates.
 *
 * Logic: if the user still has monthly allowance remaining, debit there.
 * Otherwise debit the pack balance (and decrement `userTokenBalance`).
 * If both are exhausted, the call is recorded as overage in the monthly
 * bucket — the gate will block the NEXT call, but we don't mid-call abort.
 */
export async function recordTokenUsage(args: {
  userId: string;
  model: string;
  featureKey: string;
  promptTokens: number;
  completionTokens: number;
  cost?: number;
  sessionId?: string;
}): Promise<void> {
  const db = getDb();
  const totalTokens = args.promptTokens + args.completionTokens;
  if (totalTokens <= 0) return;

  // Decide source bucket based on the user's CURRENT monthly remaining.
  // We don't try to split a single call across both buckets — we pick one
  // and debit the whole call there. Cleaner accounting, slight overage drift.
  const summary = await getTokenBudgetSummary(args.userId);
  let source: "monthly" | "pack" = "monthly";
  if (!summary.isUnlimited && summary.monthlyRemaining < totalTokens && summary.packBalance > 0) {
    source = "pack";
  }

  // Always insert the audit row.
  await db
    .insert(aiUsageRecords)
    .values({
      userId: args.userId,
      model: args.model,
      featureKey: args.featureKey,
      promptTokens: args.promptTokens,
      completionTokens: args.completionTokens,
      totalTokens,
      cost: String(args.cost ?? 0),
      source,
      sessionId: args.sessionId ?? null,
    } as any)
    .catch((err) => {
      console.warn(`[billing] recordTokenUsage insert failed for ${args.featureKey}:`, err);
    });

  // If we billed against the pack, decrement the balance row atomically.
  if (source === "pack") {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (db.insert(userTokenBalance) as any)
      .values({
        userId: args.userId,
        balance: 0,
        lifetimeGranted: 0,
        lifetimeConsumed: totalTokens,
      })
      .onConflictDoUpdate({
        target: userTokenBalance.userId,
        set: {
          balance: sql`GREATEST(0, ${userTokenBalance.balance} - ${totalTokens})`,
          lifetimeConsumed: sql`${userTokenBalance.lifetimeConsumed} + ${totalTokens}`,
          updatedAt: new Date(),
        },
      })
      .catch((err: unknown) => {
        console.warn(`[billing] pack debit failed for ${args.userId}:`, err);
      });
  }
}

/**
 * Add tokens to a user's purchased pack balance. Called after a successful
 * Stripe charge for a TOKEN_PACK SKU. Idempotent on the audit row level —
 * caller must guard against double-credit by checking the
 * `tokenPackPurchases.stripePaymentIntentId` first.
 */
export async function grantTokenPack(args: {
  userId: string;
  packId: string;
  tokens: number;
  pricePaid: number;
  currency?: string;
  stripePaymentIntentId?: string;
}): Promise<void> {
  const db = getDb();

  // Audit row.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (db.insert(tokenPackPurchases) as any).values({
    userId: args.userId,
    packId: args.packId,
    tokensGranted: args.tokens,
    pricePaid: String(args.pricePaid),
    currency: args.currency ?? "USD",
    stripePaymentIntentId: args.stripePaymentIntentId ?? null,
    status: "paid",
  });

  // Increment balance.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (db.insert(userTokenBalance) as any)
    .values({
      userId: args.userId,
      balance: args.tokens,
      lifetimeGranted: args.tokens,
      lifetimeConsumed: 0,
    })
    .onConflictDoUpdate({
      target: userTokenBalance.userId,
      set: {
        balance: sql`${userTokenBalance.balance} + ${args.tokens}`,
        lifetimeGranted: sql`${userTokenBalance.lifetimeGranted} + ${args.tokens}`,
        updatedAt: new Date(),
      },
    });
}

/**
 * Shape-normalized token-budget DTO suitable for shipping over the wire.
 * Identical to what `/api/Billing/token-budget` returns so every AI
 * response can piggy-back the same payload and clients only need one
 * rendering path. `monthlyLimit` / `monthlyRemaining` / `totalAvailable`
 * become `null` when the user has unlimited tokens.
 */
export async function buildTokenBudgetDTO(userId: string): Promise<TokenBudgetDTO> {
  const summary = await getTokenBudgetSummary(userId);
  const now = new Date();
  const resetAt = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1),
  ).toISOString();
  return {
    planId: summary.planId,
    isPro: summary.isPro,
    isUnlimited: summary.isUnlimited,
    monthly: {
      used: summary.monthlyUsed,
      limit: summary.isUnlimited ? null : summary.monthlyLimit,
      remaining: summary.isUnlimited ? null : summary.monthlyRemaining,
      resetAt,
    },
    pack: {
      balance: summary.packBalance,
    },
    totalAvailable: summary.isUnlimited ? null : summary.totalAvailable,
  };
}

// ---------------------------------------------------------------------------
// Backwards-compatible legacy DTO shape
// ---------------------------------------------------------------------------

/**
 * @deprecated Returns the legacy `AIUsageMonthDTO` shape for the existing
 * `/api/Billing/ai-usage/month` endpoint. New code should call
 * `getTokenBudgetSummary` and use the new `/api/Billing/token-budget` endpoint.
 */
export async function getMonthlyAIUsage(userId: string): Promise<AIUsageMonthDTO> {
  const summary = await getTokenBudgetSummary(userId);
  const now = new Date();
  return {
    year: now.getUTCFullYear(),
    month: now.getUTCMonth() + 1,
    used: summary.monthlyUsed,
    limit: summary.isUnlimited ? null : summary.monthlyLimit,
    remaining: summary.isUnlimited ? null : summary.totalAvailable,
    isUnlimited: summary.isUnlimited,
  };
}

/** @deprecated Use `getTokenBudgetSummary` instead. */
export async function getPremiumAIUsage(userId: string): Promise<AIUsageMonthDTO> {
  return getMonthlyAIUsage(userId);
}

/** @deprecated Use `getTokenBudgetSummary` instead. */
export async function getAIUsageForUser(userId: string): Promise<AIUsageMonthDTO> {
  return getMonthlyAIUsage(userId);
}

export async function deletePaymentMethod(userId: string, paymentMethodId: string): Promise<string> {
  const db = getDb();
  const [existing] = await db
    .select({ id: paymentMethods.id })
    .from(paymentMethods)
    .where(and(eq(paymentMethods.id, paymentMethodId), eq(paymentMethods.userId, userId)))
    .limit(1);

  if (!existing) {
    throw Object.assign(new Error("Payment method not found"), { status: 404 });
  }

  await db.delete(paymentMethods).where(eq(paymentMethods.id, paymentMethodId));
  return `Payment method ${paymentMethodId} deleted`;
}

export async function createSetupSession(
  stripeInstance: import("stripe").default,
  customerId: string,
  successUrl: string,
  cancelUrl: string,
): Promise<string> {
  const session = await stripeInstance.checkout.sessions.create({
    mode: "setup",
    customer: customerId,
    payment_method_types: ["card"],
    success_url: successUrl || "https://hired.video/settings/billing?setup=success",
    cancel_url: cancelUrl || "https://hired.video/settings/billing?setup=cancel",
  });
  return session.url ?? "https://hired.video/settings/billing";
}

/** Sync a Stripe subscription object to the local DB. */
export async function syncStripeSubscription(
  userId: string,
  stripeSub: import("stripe").default.Subscription,
): Promise<void> {
  const db = getDb();

  // Resolve the plan by looking up the Stripe price ID
  const priceId =
    typeof stripeSub.items.data[0]?.price === "object"
      ? (stripeSub.items.data[0].price as { id: string }).id
      : null;

  let planId: string | null = null;
  if (priceId) {
    const [plan] = await db
      .select({ id: subscriptionPlans.id })
      .from(subscriptionPlans)
      .where(
        // Match monthly or yearly price ID
        eq(subscriptionPlans.stripePriceIdMonthly, priceId),
      )
      .limit(1);

    if (!plan) {
      // Try yearly price
      const [planYearly] = await db
        .select({ id: subscriptionPlans.id })
        .from(subscriptionPlans)
        .where(eq(subscriptionPlans.stripePriceIdYearly, priceId))
        .limit(1);
      planId = planYearly?.id ?? null;
    } else {
      planId = plan.id;
    }
  }

  if (!planId) return; // Unknown plan — can't sync

  const customerId =
    typeof stripeSub.customer === "string" ? stripeSub.customer : stripeSub.customer?.id;

  const interval =
    (stripeSub.items.data[0]?.price as { recurring?: { interval: string } } | undefined)
      ?.recurring?.interval === "year"
      ? "yearly"
      : "monthly";

  // Upsert by stripeSubscriptionId
  const [existing] = await db
    .select({ id: subscriptions.id })
    .from(subscriptions)
    .where(eq(subscriptions.stripeSubscriptionId, stripeSub.id))
    .limit(1);

  // Note: Stripe API 2026 removed current_period_start/end; use billing_cycle_anchor as anchor.
  // The subscription schedule/next billing date is tracked via billingCycleAnchor if needed.
  const values = {
    userId,
    planId,
    stripeSubscriptionId: stripeSub.id,
    stripeCustomerId: customerId ?? null,
    status: stripeSub.status,
    billingInterval: interval,
    cancelAtPeriodEnd: stripeSub.cancel_at_period_end,
    canceledAt: stripeSub.canceled_at ? new Date(stripeSub.canceled_at * 1000) : null,
    trialEnd: stripeSub.trial_end ? new Date(stripeSub.trial_end * 1000) : null,
    updatedAt: new Date(),
  };

  if (existing) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await db.update(subscriptions).set(values as any).where(eq(subscriptions.id, existing.id));
  } else {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (db.insert(subscriptions) as any).values(values);
  }
}

/** Sync a Stripe invoice object to the local DB. */
export async function syncStripeInvoice(
  userId: string,
  stripeInv: import("stripe").default.Invoice,
): Promise<void> {
  const db = getDb();

  const [existing] = await db
    .select({ id: invoices.id })
    .from(invoices)
    .where(eq(invoices.stripeInvoiceId, stripeInv.id))
    .limit(1);

  // Resolve local subscription ID from stripeSubscriptionId
  // Stripe API 2026: subscription is nested under invoice.parent.subscription_details
  let localSubId: string | undefined;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const invAny = stripeInv as any;
  const stripeSubId: string | undefined =
    invAny.parent?.subscription_details?.subscription ??
    (typeof invAny.subscription === "string" ? invAny.subscription : invAny.subscription?.id);
  if (stripeSubId) {
    const [sub] = await db
      .select({ id: subscriptions.id })
      .from(subscriptions)
      .where(eq(subscriptions.stripeSubscriptionId, stripeSubId))
      .limit(1);
    localSubId = sub?.id;
  }

  const status =
    stripeInv.status === "paid"
      ? "paid"
      : stripeInv.status === "void"
        ? "void"
        : stripeInv.status === "open"
          ? "open"
          : "draft";

  const vals = {
    userId,
    subscriptionId: localSubId ?? null,
    stripeInvoiceId: stripeInv.id,
    status,
    total: String(stripeInv.amount_due / 100),
    currency: stripeInv.currency.toUpperCase(),
    paidAt: stripeInv.status_transitions?.paid_at
      ? new Date(stripeInv.status_transitions.paid_at * 1000)
      : null,
    invoicePdfUrl: stripeInv.invoice_pdf ?? null,
    updatedAt: new Date(),
  };

  if (existing) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await db.update(invoices).set(vals as any).where(eq(invoices.id, existing.id));
  } else {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (db.insert(invoices) as any).values(vals);
  }
}
