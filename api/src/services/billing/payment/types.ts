/**
 * Payment provider abstraction.
 *
 * All payment processing goes through the PaymentProvider interface so the
 * underlying vendor (Stripe, Helcim, Braintree, …) can be swapped without
 * touching route or business logic.
 *
 * To add a new provider:
 *   1. Implement PaymentProvider in a new file (e.g. helcim.ts)
 *   2. Register it in index.ts getPaymentProvider()
 *   3. Set PAYMENT_PROVIDER=helcim in wrangler.toml / secrets
 */

import type { BillingAddress } from "../../../../../shared/billing-address.js";

// ---------------------------------------------------------------------------
// Normalised types (provider-agnostic)
// ---------------------------------------------------------------------------

/** How the frontend collects payment details. */
export type PaymentFlowType =
  | "redirect"    // Provider hosts a payment page; frontend just follows the URL
  | "embedded";   // Provider returns a client secret / token for a JS SDK widget

/** Which payment instruments the provider widget should expose. */
export type PaymentMethodType =
  | "card"               // Credit / debit only
  | "us_bank_account"    // ACH only
  | "any";               // Buyer picks inside the widget (default)

/**
 * Caller-supplied hint about the payment method that was just collected.
 * Helcim returns this in its success postMessage but has no public
 * /cards/{token} lookup, so the frontend forwards what HelcimPay told it.
 * Stripe ignores these hints and uses its own paymentMethods.retrieve().
 */
export interface CollectedPaymentMethodHint {
  type?: "card" | "us_bank_account";
  brand?: string;
  /** Last four digits of the card / account number. */
  last4?: string;
  expiryMonth?: number;
  expiryYear?: number;
}

/**
 * Sub-flow for embedded providers — the frontend client uses this to choose
 * between an iFrame modal (e.g. HelcimPay.js) and an inline page-rendered
 * form (e.g. Helcim.js v2). Ignored for "redirect" flows.
 */
export type EmbeddedCollectionFlow = "modal" | "inline";

/** Result of initialising a payment method collection flow. */
export interface CollectPaymentMethodResult {
  /** Whether to redirect the browser or render an embedded widget. */
  flowType: PaymentFlowType;
  /** Sub-flow indicator when flowType === "embedded". */
  collectionFlow?: EmbeddedCollectionFlow;
  /** Present when flowType === "redirect". Navigate to this URL. */
  redirectUrl?: string;
  /** Present when flowType === "embedded" (Stripe: clientSecret). */
  clientSecret?: string;
  /** Present when flowType === "embedded" + collectionFlow === "modal". */
  checkoutToken?: string;
  /** CDN URL of the provider JS SDK to load, if different from default. */
  sdkScriptUrl?: string;
  /**
   * Helcim.js inline-form configuration. Present when collectionFlow === "inline".
   * The frontend renders its own card fields and calls helcimProcess() —
   * card data is tokenised via CORS AJAX and never reaches our servers.
   */
  helcimJsConfig?: {
    /** Helcim.js configuration token (HELCIM_JS_TOKEN). */
    token: string;
    /** CDN URL of the Helcim.js v2 script. */
    scriptUrl: string;
  };
  /** Charge amount in major currency units; undefined for card-on-file. */
  amount?: number;
  /** ISO-4217 currency code, e.g. "USD". */
  currency?: string;
  /** Human-readable provider name so the frontend can switch UI. */
  providerName?: string;
}

/** A saved payment method returned after successful collection. */
export interface SavedPaymentMethod {
  /** Provider-specific opaque ID (e.g. Stripe pm_xxx, Helcim token). */
  providerPaymentMethodId: string;
  type: string;       // "card" | "us_bank_account" | "helcim_card" | …
  brand?: string;     // "visa" | "mastercard" | bank name | …
  last4?: string;
  expiryMonth?: number;
  expiryYear?: number;
}

/** Normalised event types emitted by any provider's webhook. */
export type NormalizedEventType =
  | "subscription.created"
  | "subscription.updated"
  | "subscription.deleted"
  | "invoice.paid"
  | "invoice.payment_failed"
  | "payment_method.attached"
  | "payment_method.detached"
  | "payout.paid"
  | "payout.failed"
  | "unknown";

/** Normalised webhook payload delivered to the event handler. */
export interface NormalizedWebhookPayload {
  /** Provider-specific unique event ID (for idempotency). */
  eventId: string;
  eventType: NormalizedEventType;
  /** Provider customer ID. */
  customerId?: string;
  /** Provider subscription ID. */
  providerSubscriptionId?: string;
  /** Provider invoice ID. */
  providerInvoiceId?: string;
  /** Provider payment method ID. */
  providerPaymentMethodId?: string;
  /** Provider payout ID. */
  providerPayoutId?: string;
  /** Amount in major currency units (e.g. dollars, not cents). */
  amount?: number;
  currency?: string;
  /** Invoice status as reported by the provider. */
  invoiceStatus?: string;
  /** Billing reason (e.g. "subscription_create", "subscription_cycle"). */
  billingReason?: string;
  /** Invoice PDF URL, if available. */
  invoicePdfUrl?: string;
  /** Raw provider event object for advanced handlers. */
  raw: unknown;
}

// ---------------------------------------------------------------------------
// PaymentProvider interface
// ---------------------------------------------------------------------------

export interface PaymentProvider {
  /** Human-readable provider name — "stripe" | "helcim" | … */
  readonly name: string;

  /**
   * Returns the publishable / client-side key so the frontend can initialise
   * the provider's JS SDK.  Returns null if the provider uses tokenised hosted
   * pages instead (no client-side key needed).
   */
  getPublicKey(): string | null;

  /**
   * Get or create a provider-side customer record for this user.
   * Returns the provider's customer ID (e.g. Stripe cus_xxx, Helcim CSTxxx).
   *
   * Pass the user's saved billing address when available — providers that
   * support customer-side address records (Helcim, Stripe) will store it
   * so their hosted/embedded payment widgets can pre-fill the buyer's
   * billing fields. Providers that don't support address storage simply
   * ignore the hint.
   */
  getOrCreateCustomer(
    userId: string,
    email: string,
    name?: string,
    billingAddress?: BillingAddress | null,
  ): Promise<string>;

  /**
   * Create a hosted checkout session for collecting a payment method.
   * Returns a URL to redirect the user to.
   */
  createSetupSession(
    customerId: string,
    successUrl: string,
    cancelUrl: string,
  ): Promise<string>;

  /**
   * Begin an embedded payment method collection flow.
   * Returns a CollectPaymentMethodResult whose flowType indicates how the
   * frontend should proceed (redirect or embedded widget).
   *
   * Providers that only support hosted pages return flowType === "redirect"
   * and populate redirectUrl.
   *
   * `paymentMethodType` controls which instruments the provider widget
   * exposes — "card" for credit/debit only, "us_bank_account" for ACH
   * only, "any" (default) to let the buyer pick inside the widget.
   */
  initPaymentCollection(
    customerId: string,
    successUrl: string,
    cancelUrl: string,
    amount?: number,
    currency?: string,
    paymentMethodType?: PaymentMethodType,
  ): Promise<CollectPaymentMethodResult>;

  /**
   * Attach a payment method to a customer after the frontend has collected it.
   *
   * Stripe ignores `hint` and pulls authoritative card details via its own
   * paymentMethods.retrieve() API. Helcim has no public /cards/{token}
   * lookup, so it persists what HelcimPay's success postMessage reported
   * (cardType, masked card number) as forwarded through the hint.
   */
  savePaymentMethod(
    customerId: string,
    providerPaymentMethodId: string,
    setDefault?: boolean,
    hint?: CollectedPaymentMethodHint,
  ): Promise<SavedPaymentMethod>;

  /**
   * Remove a payment method from the provider.
   * Silently succeeds if already removed.
   */
  detachPaymentMethod(providerPaymentMethodId: string): Promise<void>;

  /**
   * Verify a webhook delivery and return a normalised payload.
   *
   * The provider implementation owns:
   *   - which request header carries the signature (e.g. "stripe-signature"
   *     vs "helcim-signature")
   *   - which env var holds the signing secret
   *   - the cryptographic verification scheme
   *
   * Routes pass the raw body and request Headers; nothing provider-specific
   * leaks into the route.  Throws if the signature is missing or invalid.
   */
  verifyWebhook(
    body: string,
    headers: Headers,
  ): Promise<NormalizedWebhookPayload>;

  /**
   * Cancel a subscription on the provider side.
   * @param subscriptionId — Our internal subscription ID (provider maps as needed).
   * @param immediately — If true, cancel now; otherwise cancel at period end.
   */
  cancelSubscription?(subscriptionId: string, immediately?: boolean): Promise<void>;

  /**
   * Issue a refund for a previous transaction.
   * @param transactionId — The provider's transaction / charge ID.
   * @param amountCents — Amount to refund in cents. Omit for full refund.
   * @param reason — Human-readable reason.
   */
  refundPayment?(transactionId: string, amountCents?: number, reason?: string): Promise<{ refundId: string }>;
}
