/**
 * Helcim implementation of PaymentProvider (stub).
 *
 * Helcim docs: https://devdocs.helcim.com/
 *
 * Required secrets (wrangler secret put):
 *   HELCIM_ACCOUNT_ID    — found in Helcim dashboard → Settings → API
 *   HELCIM_API_TOKEN     — generated in Helcim dashboard → Settings → API
 *   HELCIM_WEBHOOK_TOKEN — generated in Helcim dashboard → Settings → Webhooks
 *
 * Key differences from Stripe:
 *   - No "SetupIntent" concept; uses HelcimPay.js with a checkoutToken
 *   - Customers are identified by cardToken after first transaction
 *   - Webhooks use HMAC-SHA256 with HELCIM_WEBHOOK_TOKEN
 *   - HelcimPay.js script: https://cdn.helcim.com/sdks/helcim-pay.js
 *
 * To activate: set PAYMENT_PROVIDER=helcim and the three secrets above.
 */

import type {
  PaymentProvider,
  CollectPaymentMethodResult,
  SavedPaymentMethod,
  NormalizedWebhookPayload,
  NormalizedEventType,
} from "./types.js";

// ---------------------------------------------------------------------------
// Helcim API helpers
// ---------------------------------------------------------------------------

const HELCIM_API_BASE = "https://api.helcim.com/v2";
const HELCIM_PAY_JS = "https://cdn.helcim.com/sdks/helcim-pay.js";

interface HelcimConfig {
  accountId: string;
  apiToken: string;
  webhookToken: string;
}

async function helcimRequest<T = unknown>(
  config: HelcimConfig,
  method: string,
  path: string,
  body?: unknown,
): Promise<T> {
  const res = await fetch(`${HELCIM_API_BASE}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      "account-id": config.accountId,
      "api-token": config.apiToken,
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`Helcim API error ${res.status}: ${text}`);
  }

  return res.json() as Promise<T>;
}

// ---------------------------------------------------------------------------
// Helcim event type normalisation
// ---------------------------------------------------------------------------

const HELCIM_EVENT_MAP: Record<string, NormalizedEventType> = {
  // Helcim webhook event types (https://devdocs.helcim.com/docs/webhooks)
  "transaction.approved": "invoice.paid",
  "transaction.declined": "invoice.payment_failed",
  "recurring.payment.approved": "invoice.paid",
  "recurring.payment.declined": "invoice.payment_failed",
  "recurring.plan.created": "subscription.created",
  "recurring.plan.updated": "subscription.updated",
  "recurring.plan.cancelled": "subscription.deleted",
};

// ---------------------------------------------------------------------------
// HelcimPaymentProvider
// ---------------------------------------------------------------------------

export class HelcimPaymentProvider implements PaymentProvider {
  readonly name = "helcim";

  constructor(private readonly config: HelcimConfig) {}

  getPublicKey(): string | null {
    // Helcim does not use a publishable key — the checkout flow uses a
    // checkoutToken obtained server-side and the HelcimPay.js SDK.
    return null;
  }

  async getOrCreateCustomer(_userId: string, _email: string, _name?: string): Promise<string> {
    // Helcim does not have a standalone "customer" creation endpoint in the
    // same way as Stripe.  Customers are implicitly created when a card is
    // tokenised.  We return a synthetic customer ID keyed by userId so the
    // rest of the system can store it in users.stripe_customer_id (the column
    // is provider-agnostic in practice).
    //
    // TODO: If Helcim adds a Customer API, call it here and return the real ID.
    return `helcim:${_userId}`;
  }

  async createSetupSession(
    _customerId: string,
    successUrl: string,
    cancelUrl: string,
  ): Promise<string> {
    // Helcim's Hosted Payment Page (HPP) initialisation
    // POST /helcim-pay/initialize returns { checkoutToken, secretToken }
    const res = await helcimRequest<{ checkoutToken: string }>(
      this.config,
      "POST",
      "/helcim-pay/initialize",
      {
        paymentType: "purchase",
        amount: 0, // $0 auth for card-on-file
        currency: "USD",
        // Helcim uses a callback/redirect after the hosted page
        successUrl,
        cancelUrl,
      },
    );

    // The frontend must redirect to: https://secure.helcim.com/hpp/{checkoutToken}
    return `https://secure.helcim.com/hpp/${res.checkoutToken}`;
  }

  async initPaymentCollection(
    customerId: string,
    successUrl: string,
    cancelUrl: string,
  ): Promise<CollectPaymentMethodResult> {
    // Helcim supports HelcimPay.js (embedded iFrame) using a checkoutToken.
    const res = await helcimRequest<{ checkoutToken: string }>(
      this.config,
      "POST",
      "/helcim-pay/initialize",
      {
        paymentType: "purchase",
        amount: 0,
        currency: "USD",
        successUrl,
        cancelUrl,
      },
    );

    return {
      flowType: "embedded",
      checkoutToken: res.checkoutToken,
      sdkScriptUrl: HELCIM_PAY_JS,
    };
  }

  async savePaymentMethod(
    _customerId: string,
    providerPaymentMethodId: string,
    _setDefault = false,
  ): Promise<SavedPaymentMethod> {
    // In Helcim the "payment method ID" is a cardToken returned after a
    // successful HelcimPay.js transaction.  We retrieve card details via
    // GET /card-batches or from the transaction object.
    //
    // TODO: Implement full card-on-file retrieval from Helcim API.
    return {
      providerPaymentMethodId,
      type: "card",
    };
  }

  async detachPaymentMethod(_providerPaymentMethodId: string): Promise<void> {
    // Helcim does not expose a card deletion endpoint in v2 API as of 2025.
    // Cards expire naturally or can be managed through the Helcim dashboard.
    // TODO: Call DELETE /cards/{cardToken} if/when available.
  }

  async constructWebhookEvent(
    body: string,
    signature: string,
    secret: string,
  ): Promise<NormalizedWebhookPayload> {
    // Helcim signs webhooks with HMAC-SHA256.
    const { createHmac } = await import("node:crypto");
    const expected = createHmac("sha256", secret).update(body).digest("hex");
    if (signature !== expected) {
      throw new Error("Helcim webhook signature verification failed");
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const payload = JSON.parse(body) as Record<string, any>;
    const eventType: NormalizedEventType = HELCIM_EVENT_MAP[payload.eventType] ?? "unknown";

    return {
      eventId: String(payload.eventId ?? payload.transactionId ?? Date.now()),
      eventType,
      customerId: payload.cardToken ?? payload.customerId,
      providerSubscriptionId: payload.recurringPlanId,
      providerInvoiceId: payload.transactionId,
      amount: payload.amount ? Number(payload.amount) : undefined,
      currency: payload.currency?.toUpperCase(),
      billingReason: payload.eventType,
      raw: payload,
    };
  }
}
