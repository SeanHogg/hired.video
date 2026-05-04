/**
 * Helcim implementation of PaymentProvider.
 *
 * Supports TWO front-end collection flows so you can A/B test:
 *
 *   1. **HelcimPay.js** (modal) — server calls POST /helcim-pay/initialize
 *      to get a checkoutToken, then the frontend loads the HelcimPay.js SDK
 *      and calls appendHelcimPayIframe(checkoutToken).  The iFrame handles
 *      everything.
 *
 *   2. **Helcim.js** (inline form) — the frontend renders its own card
 *      number / expiry / CVV inputs (with specific `id` attributes) and
 *      includes <script src="https://secure.myhelcim.com/js/version2.js">.
 *      On form submit it calls helcimProcess(); Helcim.js tokenises the
 *      card via CORS AJAX → our servers never see raw card numbers.
 *
 * Required secrets (wrangler secret put):
 *   HELCIM_API_TOKEN     — generated in Helcim dashboard → All Tools → Integrations → API Access
 *
 * Optional secrets:
 *   HELCIM_JS_TOKEN      — Helcim.js Configuration token (for inline form flow)
 *   HELCIM_JS_SECRET     — Helcim.js Configuration secret (for amount hashing)
 *   HELCIM_WEBHOOK_TOKEN — generated in Helcim dashboard → Settings → Webhooks
 *
 * Authentication: Helcim only requires the `api-token` header — there is no
 * `account-id` header in the Helcim v2 API.
 *
 * To activate: set PAYMENT_PROVIDER=helcim and the secrets above.
 */

import type {
  PaymentProvider,
  CollectPaymentMethodResult,
  SavedPaymentMethod,
  NormalizedWebhookPayload,
  NormalizedEventType,
  PaymentMethodType,
} from "./types.js";

/** Map our normalised payment-method-type to Helcim's `paymentMethod` value. */
function helcimPaymentMethodValue(type?: PaymentMethodType): "cc" | "ach" | "cc-ach" {
  if (type === "card") return "cc";
  if (type === "us_bank_account") return "ach";
  return "cc-ach";
}

// ---------------------------------------------------------------------------
// Helcim API helpers
// ---------------------------------------------------------------------------

const HELCIM_API_BASE = "https://api.helcim.com/v2";
const HELCIM_PAY_JS = "https://secure.helcim.app/helcim-pay/services/start.js";
const HELCIM_JS_SCRIPT = "https://secure.myhelcim.com/js/version2.js";

interface HelcimConfig {
  apiToken: string;        // HELCIM_API_TOKEN — used for all server-to-server API calls
  jsToken?: string;        // HELCIM_JS_TOKEN — used client-side for Helcim.js inline form
  jsSecret?: string;       // HELCIM_JS_SECRET — used server-side for amount hashing
  webhookToken?: string;   // HELCIM_WEBHOOK_TOKEN — for webhook signature verification
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
      // Helcim v2 API authenticates via api-token header only — no account-id.
      // See: https://devdocs.helcim.com/docs/authentication-with-the-helcim-api-and-helcimpayjs
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
    // Helcim's Hosted Payment Page (HPP) initialisation. paymentType=verify
    // is the card-on-file flow — Helcim tokenises the card without billing.
    // Using paymentType=purchase with amount=0 is rejected by Helcim's API.
    const res = await helcimRequest<{ checkoutToken: string }>(
      this.config,
      "POST",
      "/helcim-pay/initialize",
      {
        paymentType: "verify",
        currency: "USD",
        successUrl,
        cancelUrl,
      },
    );

    // The frontend must redirect to: https://secure.helcim.com/hpp/{checkoutToken}
    return `https://secure.helcim.com/hpp/${res.checkoutToken}`;
  }

  async initPaymentCollection(
    _customerId: string,
    successUrl: string,
    cancelUrl: string,
    amount?: number,
    currency?: string,
    paymentMethodType?: PaymentMethodType,
  ): Promise<CollectPaymentMethodResult> {
    const currencyValue = currency ?? "USD";
    const paymentMethod = helcimPaymentMethodValue(paymentMethodType);
    // Helcim rejects amount=0 for paymentType=purchase. For card-on-file
    // (Settings → Add payment method) we issue a `verify` instead — Helcim
    // tokenises the card without billing, returning a cardToken on success.
    const isCardOnFile = !amount || amount <= 0;
    const initBody: Record<string, unknown> = isCardOnFile
      ? {
          paymentType: "verify",
          paymentMethod,
          currency: currencyValue,
          successUrl,
          cancelUrl,
        }
      : {
          paymentType: "purchase",
          paymentMethod,
          amount,
          currency: currencyValue,
          successUrl,
          cancelUrl,
        };

    const res = await helcimRequest<{ checkoutToken: string }>(
      this.config,
      "POST",
      "/helcim-pay/initialize",
      initBody,
    );

    const result: CollectPaymentMethodResult = {
      flowType: "embedded",
      checkoutToken: res.checkoutToken,
      sdkScriptUrl: HELCIM_PAY_JS,
      providerName: "helcim",
    };

    // 2. Helcim.js inline-form config (if JS token is set)
    //    The frontend can choose either flow.
    if (this.config.jsToken) {
      result.helcimJsConfig = {
        token: this.config.jsToken,
        scriptUrl: HELCIM_JS_SCRIPT,
      };
    }

    return result;
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

  async verifyWebhook(body: string, headers: Headers): Promise<NormalizedWebhookPayload> {
    if (!this.config.webhookToken) {
      throw new Error("HELCIM_WEBHOOK_TOKEN is not configured");
    }
    const signature = headers.get("helcim-signature");
    if (!signature) throw new Error("Missing helcim-signature header");

    // Helcim signs webhooks with HMAC-SHA256.
    const { createHmac } = await import("node:crypto");
    const expected = createHmac("sha256", this.config.webhookToken).update(body).digest("hex");
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

  async cancelSubscription(subscriptionId: string, _immediately?: boolean): Promise<void> {
    // Helcim manages recurring plans via their dashboard or the
    // recurring-plans API.  If a providerSubscriptionId (recurring plan ID)
    // is stored, we'd call DELETE /recurring-plans/{id}.
    //
    // For now we handle cancellation at the DB layer; the admin route
    // marks the subscription canceled.  When Helcim recurring API support
    // is fully integrated, uncomment the API call below.
    //
    // await helcimRequest(this.config, "DELETE", `/recurring-plans/${subscriptionId}`);
    console.info(`[helcim] cancelSubscription called for ${subscriptionId} — handled at DB layer`);
  }

  async refundPayment(
    transactionId: string,
    amountCents?: number,
    _reason?: string,
  ): Promise<{ refundId: string }> {
    const refundBody: Record<string, unknown> = {
      originalTransactionId: Number(transactionId),
    };
    if (amountCents !== undefined) {
      refundBody.amount = amountCents / 100;
    }
    const res = await helcimRequest<{ transactionId: number }>(
      this.config,
      "POST",
      "/payment/refund",
      refundBody,
    );
    return { refundId: String(res.transactionId) };
  }
}
