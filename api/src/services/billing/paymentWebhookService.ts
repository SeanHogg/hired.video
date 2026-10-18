/**
 * Payment webhook processing (provider-agnostic). The route verifies the
 * provider signature; this records the event idempotently and dispatches
 * the normalised payload.
 */
import { getDb } from "../../db/index.js";
import { InvoicesRepository } from "../../repositories/invoicesRepository.js";
import { SubscriptionsRepository } from "../../repositories/subscriptionsRepository.js";
import { PaymentMethodsRepository } from "../../repositories/paymentMethodsRepository.js";
import { setPayoutStatusByTransactionId } from "../../repositories/affiliatesRepository.js";
import { recordAffiliateConversion } from "../affiliates/affiliateConversionService.js";
import { getUserIdByStripeCustomer } from "./payment/stripe.js";
import type { NormalizedWebhookPayload } from "./payment/types.js";
import * as billingService from "./BillingService.js";
import { buildTokenPackDeps } from "./token-packs/tokenPackDeps.js";
import { confirmTokenPackFromWebhook } from "./token-packs/tokenPackUseCases.js";

/** Record + dispatch a verified webhook. A duplicate event id is a no-op;
 *  a dispatch failure is logged (the event stays unprocessed) and swallowed
 *  so the provider still gets its 200. */
export async function processPaymentWebhook(
  payload: NormalizedWebhookPayload,
  env: Record<string, string | undefined>,
): Promise<void> {
  const db = getDb();
  const invoices = new InvoicesRepository(db);

  if (await invoices.hasBillingEvent(payload.eventId)) return;

  await invoices.insertBillingEvent({
    stripeEventId: payload.eventId, // column stores provider event ID generically
    eventType: payload.eventType,
    payload: payload.raw as Record<string, unknown>,
  } as any);

  try {
    await dispatchWebhookEvent(db, payload, env);
    await invoices.markBillingEventProcessed(payload.eventId);
  } catch (err) {
    console.error(`[webhook] Failed to dispatch ${payload.eventType}:`, err);
  }
}

async function dispatchWebhookEvent(
  db: ReturnType<typeof getDb>,
  payload: NormalizedWebhookPayload,
  env: Record<string, string | undefined>,
): Promise<void> {
  // Resolve userId from provider customerId (works for any provider that
  // stores customerId on the users table).
  const resolveUserId = async (): Promise<string | null> => {
    if (!payload.customerId) return null;
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
      const userIds = await new SubscriptionsRepository(db).cancelByProviderSubscriptionId(payload.providerSubscriptionId);
      // Bust the cached effective plan (`plan:{userId}`) so the user
      // loses Pro immediately rather than after the cache TTL.
      for (const userId of userIds) billingService.invalidateSubscriptionCache(userId);
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
      await new PaymentMethodsRepository(db).deleteByProviderId(payload.providerPaymentMethodId);
      break;
    }

    case "payout.paid":
    case "payout.failed": {
      if (!payload.providerPayoutId) break;
      await setPayoutStatusByTransactionId(
        payload.providerPayoutId,
        payload.eventType === "payout.paid" ? "paid" : "failed",
        db,
      );
      break;
    }

    default:
      break;
  }
}
