import { and, eq, gte, inArray, lt, sum } from "drizzle-orm";
import { getDb, schema } from "../db/index.js";
import type {
  AIUsageMonthDTO,
  InvoiceDTO,
  PaymentMethodDTO,
  SubscriptionSummaryDTO,
} from "../../../shared/billing.js";
import { FREE_AI_MONTHLY_LIMIT } from "../../../shared/pricing.js";

const { subscriptions, subscriptionPlans, paymentMethods, invoices, aiUsageRecords, users } = schema;

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

export async function getMonthlyAIUsage(userId: string): Promise<AIUsageMonthDTO> {
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
        gte(aiUsageRecords.createdAt, periodStart),
        lt(aiUsageRecords.createdAt, periodEnd),
      ),
    );

  const used = Number(row?.used ?? 0);
  return {
    year: now.getUTCFullYear(),
    month: now.getUTCMonth() + 1,
    used,
    limit: FREE_AI_MONTHLY_LIMIT,
    remaining: Math.max(0, FREE_AI_MONTHLY_LIMIT - used),
    isUnlimited: false,
  };
}

export async function getPremiumAIUsage(userId: string): Promise<AIUsageMonthDTO> {
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
        gte(aiUsageRecords.createdAt, periodStart),
        lt(aiUsageRecords.createdAt, periodEnd),
      ),
    );

  const used = Number(row?.used ?? 0);
  return {
    year: now.getUTCFullYear(),
    month: now.getUTCMonth() + 1,
    used,
    limit: null,
    remaining: null,
    isUnlimited: true,
  };
}

/** Returns correct usage DTO based on the user's subscription tier. */
export async function getAIUsageForUser(userId: string): Promise<AIUsageMonthDTO> {
  const sub = await getSubscription(userId);
  return sub.isPremium ? getPremiumAIUsage(userId) : getMonthlyAIUsage(userId);
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
