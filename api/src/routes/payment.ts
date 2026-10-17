/**
 * Payment routes — provider-agnostic.
 *
 * All payment processing is delegated to the PaymentProvider implementation
 * selected by the PAYMENT_PROVIDER env var (default: "stripe").
 * Swap to Helcim (or any future provider) by setting PAYMENT_PROVIDER=helcim.
 */

import { Hono, type Context } from "hono";
import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import type { Variables, AppEnv } from "../types/index.js";
import { error, success } from "../types/index.js";
import { getDb, schema } from "../db/index.js";
import { applySpecialtyBonus } from "../../../shared/sectors.js";
import { tryGetPaymentProvider } from "../services/billing/payment/index.js";
import { loadUserBillingContext } from "../services/billing/userBillingContext.js";
import { getUserIdByStripeCustomer } from "../services/billing/payment/stripe.js";
import * as billingService from "../services/billing/BillingService.js";
import { tryGetPayoutProvider } from "../services/payout/index.js";
import { applyPayoutWebhook } from "./payouts.js";
import { buildTokenPackDeps } from "../services/billing/token-packs/tokenPackDeps.js";
import { confirmTokenPackFromWebhook } from "../services/billing/token-packs/tokenPackUseCases.js";

export const paymentRoutes = new Hono<AppEnv>();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function ok<T>(data: T) {
  return { success: true as const, data, timestamp: new Date().toISOString() };
}

function getEnv(c: unknown): Record<string, string | undefined> {
  return (c as { env?: Record<string, string | undefined> }).env ?? {};
}


// ---------------------------------------------------------------------------
// GET /api/payment/public-key
// Returns the provider's publishable key (for Stripe.js / HelcimPay.js init).
// ---------------------------------------------------------------------------
paymentRoutes.get("/public-key", (c) => {
  const provider = tryGetPaymentProvider(getEnv(c));
  if (!provider) return c.json(error("NOT_CONFIGURED", "Payment provider not configured"), 503);

  const key = provider.getPublicKey();
  // Return both the key and the provider name so the frontend can load the right SDK
  return c.json(ok({ publicKey: key, provider: provider.name }), 200);
});

// ---------------------------------------------------------------------------
// POST /api/payment/init-collection
// Initialise a payment method collection flow. Returns either:
//   { flowType: "embedded", clientSecret }  — use provider JS SDK
//   { flowType: "redirect", redirectUrl }   — navigate browser to URL
// ---------------------------------------------------------------------------
paymentRoutes.post("/init-collection", async (c) => {
  const userId = c.var.user?.sub;
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);

  const body = await c.req.json().catch(() => ({})) as {
    successUrl?: string;
    cancelUrl?: string;
    amount?: number;
    currency?: string;
    paymentMethodType?: "card" | "us_bank_account" | "any";
  };

  const provider = tryGetPaymentProvider(getEnv(c));
  if (!provider) return c.json(error("NOT_CONFIGURED", "Payment provider not configured"), 503);

  const ctx = await loadUserBillingContext(userId);
  if (!ctx) return c.json(error("NOT_FOUND", "User not found"), 404);

  const customerId = await provider.getOrCreateCustomer(
    userId,
    ctx.user.email,
    ctx.user.name,
    ctx.billingAddress,
  );
  const result = await provider.initPaymentCollection(
    customerId,
    body.successUrl ?? `${c.req.header("origin") ?? "https://hired.video"}/checkout/success`,
    body.cancelUrl ?? `${c.req.header("origin") ?? "https://hired.video"}/checkout?cancelled=true`,
    body.amount,
    body.currency,
    body.paymentMethodType,
  );

  return c.json(ok(result), 200);
});

// ---------------------------------------------------------------------------
// POST /api/payment/setup-intent
// Alias for init-collection for backwards compatibility with existing clients.
// ---------------------------------------------------------------------------
paymentRoutes.post("/setup-intent", async (c) => {
  const userId = c.var.user?.sub;
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);

  const provider = tryGetPaymentProvider(getEnv(c));
  if (!provider) return c.json(error("NOT_CONFIGURED", "Payment provider not configured"), 503);

  const ctx = await loadUserBillingContext(userId);
  if (!ctx) return c.json(error("NOT_FOUND", "User not found"), 404);

  const customerId = await provider.getOrCreateCustomer(
    userId,
    ctx.user.email,
    ctx.user.name,
    ctx.billingAddress,
  );
  const result = await provider.initPaymentCollection(
    customerId,
    `${c.req.header("origin") ?? "https://hired.video"}/checkout/success`,
    `${c.req.header("origin") ?? "https://hired.video"}/checkout?cancelled=true`,
  );

  // Legacy shape — if embedded return clientSecret, else redirectUrl
  if (result.flowType === "embedded") {
    return c.json(ok({ clientSecret: result.clientSecret ?? result.checkoutToken }), 200);
  }
  return c.json(ok({ redirectUrl: result.redirectUrl }), 200);
});

// ---------------------------------------------------------------------------
// POST /api/payment/save-payment-method
// Attaches a collected payment method to the customer and persists to DB.
// ---------------------------------------------------------------------------
const SavePaymentMethodSchema = z.object({
  paymentMethodId: z.string().min(1),
  setDefault: z.boolean().optional().default(false),
  // Metadata captured from the provider's success postMessage (Helcim
  // doesn't expose a /cards/{token} lookup, so the masked card details
  // come from HelcimPay itself). Stripe ignores this and pulls from its
  // own API.
  type: z.enum(["card", "us_bank_account"]).optional(),
  brand: z.string().optional(),
  last4: z.string().optional(),
  expiryMonth: z.number().int().optional(),
  expiryYear: z.number().int().optional(),
});

paymentRoutes.post("/save-payment-method", async (c) => {
  const userId = c.var.user?.sub;
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);

  const body = await c.req.json().catch(() => null);
  const parsed = SavePaymentMethodSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(error("VALIDATION_ERROR", "paymentMethodId is required", parsed.error.flatten()), 400);
  }

  const { paymentMethodId, setDefault, type, brand, last4, expiryMonth, expiryYear } = parsed.data;

  const provider = tryGetPaymentProvider(getEnv(c));
  if (!provider) return c.json(error("NOT_CONFIGURED", "Payment provider not configured"), 503);

  const ctx = await loadUserBillingContext(userId);
  if (!ctx) return c.json(error("NOT_FOUND", "User not found"), 404);

  const customerId = await provider.getOrCreateCustomer(
    userId,
    ctx.user.email,
    ctx.user.name,
    ctx.billingAddress,
  );

  const db = getDb();

  let pm: Awaited<ReturnType<typeof provider.savePaymentMethod>>;
  try {
    pm = await provider.savePaymentMethod(customerId, paymentMethodId, setDefault, {
      type,
      brand,
      last4,
      expiryMonth,
      expiryYear,
    });
  } catch (providerErr: unknown) {
    const msg = providerErr instanceof Error ? providerErr.message : "Payment provider error";
    return c.json(error("PROVIDER_ERROR", msg), 400);
  }

  // If setting as default, unset other defaults
  if (setDefault) {
     
    await db.update(schema.paymentMethods).set({ isDefault: false } as any).where(eq(schema.paymentMethods.userId, userId));
  }

  // Upsert into local paymentMethods table
  const [existing] = await db
    .select({ id: schema.paymentMethods.id })
    .from(schema.paymentMethods)
    .where(eq(schema.paymentMethods.stripePaymentMethodId, paymentMethodId))
    .limit(1);

  if (existing) {
     
    await db.update(schema.paymentMethods).set({ isDefault: setDefault, updatedAt: new Date() } as any).where(eq(schema.paymentMethods.id, existing.id));
  } else {
     
    await (db.insert(schema.paymentMethods) as any).values({
      userId,
      stripePaymentMethodId: pm.providerPaymentMethodId, // column stores provider's PM ID
      type: pm.type,
      brand: pm.brand ?? null,
      last4: pm.last4 ?? null,
      expiryMonth: pm.expiryMonth ?? null,
      expiryYear: pm.expiryYear ?? null,
      isDefault: setDefault,
    });
  }

  return c.json(ok({ ...pm, isDefault: setDefault }), 200);
});

// ---------------------------------------------------------------------------
// POST /api/payment/webhook — the ONE provider webhook URL (Helcim acquiring
// + ACH payouts share it). The legacy /stripe/webhook alias was removed
// 2026-10-17: production runs Helcim; if Stripe is re-enabled, point its
// dashboard endpoint here. Verifies the provider signature and dispatches
// normalised events.
// ---------------------------------------------------------------------------
async function handleWebhook(c: Context<AppEnv>) {
  const provider = tryGetPaymentProvider(getEnv(c));
  if (!provider) return c.json(error("NOT_CONFIGURED", "Payment provider not configured"), 503);

  const rawBody = await c.req.text();

  // Helcim shares its webhook URL between acquiring (CC + ACH inbound) and
  // ACH credits (outbound payouts). Give the payout provider first crack at
  // the raw event; if it claims the event we record + apply it via the
  // payout pipeline and stop. The signature has already been validated by
  // the payout provider so we don't double-check it on the way through.
  if (provider.name === "helcim") {
    const payoutProvider = tryGetPayoutProvider("helcim_ach", getEnv(c));
    if (payoutProvider) {
      try {
        const payoutPayload = await payoutProvider.verifyAndNormalizeWebhook(rawBody, c.req.raw.headers);
        if (payoutPayload) {
          await applyPayoutWebhook(payoutPayload, "helcim_ach");
          return c.json({ received: true }, 200);
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Webhook signature verification failed";
        return c.json(error("WEBHOOK_ERROR", msg), 400);
      }
    }
  }

  let payload: Awaited<ReturnType<typeof provider.verifyWebhook>>;
  try {
    payload = await provider.verifyWebhook(rawBody, c.req.raw.headers);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Webhook signature verification failed";
    return c.json(error("WEBHOOK_ERROR", msg), 400);
  }

  const db = getDb();

  // Idempotency check
  const [alreadyProcessed] = await db
    .select({ id: schema.billingEvents.id })
    .from(schema.billingEvents)
    .where(eq(schema.billingEvents.stripeEventId, payload.eventId))
    .limit(1);

  if (alreadyProcessed) return c.json({ received: true }, 200);

  // Record event
   
  await (db.insert(schema.billingEvents) as any).values({
    stripeEventId: payload.eventId,  // column stores provider event ID generically
    eventType: payload.eventType,
    payload: payload.raw as Record<string, unknown>,
  });

  try {
    await dispatchWebhookEvent(db, payload, getEnv(c));
     
    await db.update(schema.billingEvents).set({ processedAt: new Date() } as any).where(eq(schema.billingEvents.stripeEventId, payload.eventId));
  } catch (err) {
    console.error(`[webhook] Failed to dispatch ${payload.eventType}:`, err);
  }

  return c.json({ received: true }, 200);
}

paymentRoutes.post("/webhook", handleWebhook as any);

// ---------------------------------------------------------------------------
// Webhook event dispatcher (normalised — provider-agnostic)
// ---------------------------------------------------------------------------
async function dispatchWebhookEvent(
  db: ReturnType<typeof getDb>,
  payload: Awaited<ReturnType<NonNullable<ReturnType<typeof tryGetPaymentProvider>>["verifyWebhook"]>>,
  env: Record<string, string | undefined>,
): Promise<void> {
  // Resolve userId from provider customerId
  const resolveUserId = async (): Promise<string | null> => {
    if (!payload.customerId) return null;
    // Try Stripe-style lookup (works for any provider that stores customerId on users table)
    return getUserIdByStripeCustomer(payload.customerId);
  };

  switch (payload.eventType) {
    case "subscription.created":
    case "subscription.updated": {
      const userId = await resolveUserId();
      if (!userId || !payload.providerSubscriptionId) break;
      // Sync subscription from raw Stripe object when available
       
      const raw = payload.raw as any;
      if (raw?.data?.object?.object === "subscription") {
        await billingService.syncStripeSubscription(userId, raw.data.object);
      }
      break;
    }

    case "subscription.deleted": {
      if (!payload.providerSubscriptionId) break;
       
      const canceled = await db
        .update(schema.subscriptions)
        .set({ status: "canceled", canceledAt: new Date(), updatedAt: new Date() } as any)
        .where(eq(schema.subscriptions.stripeSubscriptionId, payload.providerSubscriptionId))
        .returning({ userId: schema.subscriptions.userId });
      // Bust the cached effective plan (`plan:{userId}`) so the user
      // loses Pro immediately rather than after the cache TTL.
      for (const row of canceled) {
        if (row.userId) billingService.invalidateSubscriptionCache(row.userId);
      }
      break;
    }

    case "invoice.paid": {
      // Helcim `transaction.approved` for a pack tagged with
      // invoiceNumber `token-pack:{packId}` — credit even if the tab
      // closed before POST /confirm (gap #2352). Stripe invoices don't
      // carry that prefix, so they fall through.
      const packOutcome = await confirmTokenPackFromWebhook(
        buildTokenPackDeps(env),
        payload,
        getUserIdByStripeCustomer,
      );
      if (packOutcome !== "ignored") break;

      const userId = await resolveUserId();
      if (!userId) break;
       
      const raw = payload.raw as any;
      if (raw?.data?.object?.object === "invoice") {
        await billingService.syncStripeInvoice(userId, raw.data.object);
      }
      // Record affiliate conversion on first subscription payment
      if (payload.billingReason === "subscription_create") {
        await recordAffiliateConversion(db, userId, payload.amount ?? 0, payload.currency ?? "USD");
      }
      // Voice Clone Marketplace: when a one-off charge for voice clones
      // succeeds, the Stripe payment_intent / Helcim transaction will carry
      // metadata.voice_clone_ids = "id1,id2,..." set by the cart finalize
      // call. Once provider one-off charges are normalised into the
      // NormalizedWebhookPayload (see services/payment/types.ts), parse that
      // metadata here and call grantVoiceClonePurchaseLicense() per item.
      // For now, the synchronous /api/studio/voice-clones/cart-checkout
      // route handles license granting at cart finalization time.
      break;
    }

    case "invoice.payment_failed": {
      const userId = await resolveUserId();
      if (!userId) break;
       
      const raw = payload.raw as any;
      if (raw?.data?.object?.object === "invoice") {
        await billingService.syncStripeInvoice(userId, raw.data.object);
      }
      break;
    }

    case "payment_method.detached": {
      if (!payload.providerPaymentMethodId) break;
      await db.delete(schema.paymentMethods).where(eq(schema.paymentMethods.stripePaymentMethodId, payload.providerPaymentMethodId));
      break;
    }

    case "payout.paid": {
      if (!payload.providerPayoutId) break;
       
      await db.update(schema.affiliatePayouts).set({ status: "paid", transactionId: payload.providerPayoutId, processedAt: new Date(), updatedAt: new Date() } as any).where(eq(schema.affiliatePayouts.transactionId, payload.providerPayoutId));
      break;
    }

    case "payout.failed": {
      if (!payload.providerPayoutId) break;
       
      await db.update(schema.affiliatePayouts).set({ status: "failed", transactionId: payload.providerPayoutId, updatedAt: new Date() } as any).where(eq(schema.affiliatePayouts.transactionId, payload.providerPayoutId));
      break;
    }

    default:
      break;
  }
}

// ---------------------------------------------------------------------------
// Affiliate conversion recording (provider-agnostic)
// ---------------------------------------------------------------------------
export async function recordAffiliateConversion(
  db: ReturnType<typeof getDb>,
  userId: string,
  revenue: number,
  _currency: string,
): Promise<void> {
  // Two sequential reads instead of a single join — webhook path runs at
  // most once per payment, so the extra roundtrip is irrelevant. Splits
  // cleanly across the join boundary the fake-db harness doesn't model,
  // which is what keeps the regression tests in
  // routes/__tests__/recordAffiliateConversion.test.ts viable.
  const [referral] = await db
    .select({
      id: schema.affiliateReferrals.id,
      affiliateId: schema.affiliateReferrals.affiliateId,
      landingSector: schema.affiliateReferrals.landingSector,
      convertedAt: schema.affiliateReferrals.convertedAt,
    })
    .from(schema.affiliateReferrals)
    .where(eq(schema.affiliateReferrals.referredUserId, userId))
    .limit(1);

  if (!referral) return;
  // Idempotency guard (#1196). Without this, every recurring-subscription
  // webhook would mint a new commission and bump totalEarned — affiliates
  // would be credited every month for a single referred user. Stamp
  // `convertedAt` on first conversion; subsequent webhooks for the same
  // referral short-circuit here.
  if (referral.convertedAt) return;

  const [profile] = await db
    .select({
      commissionRate: schema.affiliateProfiles.commissionRate,
      specialtySectors: schema.affiliateProfiles.specialtySectors,
      totalEarned: schema.affiliateProfiles.totalEarned,
    })
    .from(schema.affiliateProfiles)
    .where(eq(schema.affiliateProfiles.id, referral.affiliateId))
    .limit(1);
  if (!profile) return; // affiliate profile was deleted after the referral

  // Vertical-specialty bonus engine (#1166). Pure shared helper composes
  // baseRate + tier bonus + flat sector-match bonus. Tier bonus is not
  // joined yet (the affiliate-tier ladder is a follow-on table); for now
  // we pass tierBonus=0 and the specialty multiplier is the only modifier
  // on top of the base commission rate.
  const specialty = applySpecialtyBonus({
    baseRate: Number(profile.commissionRate),
    tierBonus: 0,
    specialtySectors: (profile.specialtySectors as string[]) ?? [],
    landingSector: referral.landingSector,
  });
  const commission = revenue * specialty.effectiveRate;

  // Atomic claim (#1684). The Neon HTTP driver can't span statements in a
  // transaction, so instead of insert-then-stamp (which double-credits if a
  // retry lands between the two), we CLAIM the referral first with a
  // conditional update on `convertedAt IS NULL`. Postgres makes the single
  // UPDATE atomic, so exactly one webhook run wins the claim; the rest get
  // zero rows back and bail. Worst case on a mid-fan-out crash is one missed
  // credit (re-runnable), not a duplicate — the safe failure direction.
   
  const claimed = await db
    .update(schema.affiliateReferrals)
    .set({ convertedAt: new Date() } as any)
    .where(and(
      eq(schema.affiliateReferrals.id, referral.id),
      isNull(schema.affiliateReferrals.convertedAt),
    ))
    .returning({ id: schema.affiliateReferrals.id });
  if (claimed.length === 0) return; // another run already credited this referral

   
  await (db.insert(schema.affiliateConversions) as any).values({
    affiliateId: referral.affiliateId,
    referralId: referral.id,
    conversionType: "subscription",
    revenue: String(revenue),
    commission: String(commission),
    status: "pending",
  });

  // Accumulator fix (#1197). Read the column directly off the destructured
  // profile row (a prior bug indexed an already-destructured value, so
  // totalEarned was overwritten to a single commission each time).
  const newTotal = Number(profile.totalEarned ?? 0) + commission;
   
  await db.update(schema.affiliateProfiles).set({ totalEarned: String(newTotal), updatedAt: new Date() } as any).where(eq(schema.affiliateProfiles.id, referral.affiliateId));
}

// ---------------------------------------------------------------------------
// POST /api/payment/create-setup-session  (legacy — kept for existing clients)
// ---------------------------------------------------------------------------
paymentRoutes.post("/create-setup-session", async (c) => {
  const userId = c.var.user?.sub;
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);

  const body = await c.req.json().catch(() => null) as { successUrl?: string; cancelUrl?: string } | null;

  const provider = tryGetPaymentProvider(getEnv(c));
  if (!provider) {
    // Graceful degradation — redirect to billing settings
    return c.json(ok({ Url: "https://hired.video/settings/billing?billing_setup=1" }), 200);
  }

  const ctx = await loadUserBillingContext(userId);
  if (!ctx) return c.json(error("NOT_FOUND", "User not found"), 404);

  const customerId = await provider.getOrCreateCustomer(
    userId,
    ctx.user.email,
    ctx.user.name,
    ctx.billingAddress,
  );
  const url = await provider.createSetupSession(
    customerId,
    body?.successUrl ?? "https://hired.video/checkout/success",
    body?.cancelUrl ?? "https://hired.video/checkout?cancelled=true",
  );
  return c.json(ok({ Url: url }), 200);
});

// ---------------------------------------------------------------------------
// DELETE /api/payment/payment-methods/:id
// ---------------------------------------------------------------------------
paymentRoutes.delete("/payment-methods/:id", async (c) => {
  const userId = c.var.user?.sub ?? null;
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);

  const id = c.req.param("id");
  if (!id) return c.json(error("VALIDATION_ERROR", "Missing payment method id"), 400);

  // Detach from provider if available
  const provider = tryGetPaymentProvider(getEnv(c));
  if (provider) {
    const db = getDb();
    const [pm] = await db
      .select({ stripePaymentMethodId: schema.paymentMethods.stripePaymentMethodId })
      .from(schema.paymentMethods)
      .where(eq(schema.paymentMethods.id, id))
      .limit(1);
    if (pm?.stripePaymentMethodId) {
      await provider.detachPaymentMethod(pm.stripePaymentMethodId).catch(() => {/* already removed */});
    }
  }

  const message = await billingService.deletePaymentMethod(userId, id);
  return c.json({ message }, 200);
});

paymentRoutes.all("*", (c) =>
  c.json(error("NOT_FOUND", "Payment route not found"), 404),
);
