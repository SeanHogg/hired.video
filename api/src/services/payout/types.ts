/**
 * Outbound payout provider abstraction.
 *
 * Mirrors the `PaymentProvider` interface in services/billing/payment/types.ts
 * but for the OTHER direction — paying creators out from their accrued
 * balance. Kept as a separate interface because the contracts diverge:
 *
 *   PaymentProvider  — hosted CC collection, charge/refund, webhook for
 *                      subscription + invoice + payment-method events
 *   PayoutProvider   — onboarding session for recipient bank/email,
 *                      push-payment create, webhook for transfer settlement
 *
 * Adding a new rail:
 *   1. Implement PayoutProvider in a new file (e.g. wise.ts)
 *   2. Register it in api/src/services/payout/index.ts
 *   3. Add the provider key to shared/payout-profile.ts ACTIVE_PAYOUT_PROVIDERS
 */

import type { ActivePayoutProvider } from "../../../../shared/payout-profile.js";

// ---------------------------------------------------------------------------
// Onboarding session
// ---------------------------------------------------------------------------

/**
 * How the frontend collects the recipient's payout instrument.
 *   embedded — provider hosts a JS widget; we return a token to mount it
 *   email    — no widget; the recipient's email IS the account reference
 *              (Tremendous). Frontend just confirms the email and POSTs.
 *   manual   — admin-driven off-platform payouts; flow records a reference
 *              string and flips payouts_enabled on the next /complete.
 */
export type PayoutOnboardingFlowType = "embedded" | "email" | "manual";

export interface PayoutOnboardingSession {
  flowType: PayoutOnboardingFlowType;
  checkoutToken?: string;
  sdkScriptUrl?: string;
  helcimJsConfig?: {
    token: string;
    scriptUrl: string;
  };
}

// ---------------------------------------------------------------------------
// Push-payment + webhook
// ---------------------------------------------------------------------------

export interface CreatePayoutInput {
  /** Internal payouts.id — passed back in metadata so webhooks can reconcile. */
  payoutId: string;
  /** Recipient's stored provider account id (bankToken | email | reference). */
  providerAccountId: string;
  amountCents: number;
  currency: string;
  /** Free-form memo / statement descriptor where the provider supports it. */
  memo?: string;
}

export interface CreatePayoutResult {
  /** Provider's payout / transfer / order id. Stored on payouts.provider_payout_id. */
  providerPayoutId: string;
  /** Provider's reported status string ("pending" | "sent" | "delivered" | …). */
  providerStatus: string;
  /**
   * Indicates whether the provider already considers the payout settled at
   * this point (e.g. Tremendous delivers the gift card immediately) or
   * whether we need to wait for a webhook (Helcim ACH effective-date).
   */
  isSettled: boolean;
}

export type PayoutEventType =
  | "payout.sent"
  | "payout.settled"
  | "payout.failed"
  | "payout.reversed"
  | "unknown";

export interface NormalizedPayoutWebhookPayload {
  /** Provider-specific unique event id (for idempotency on billing_events). */
  eventId: string;
  eventType: PayoutEventType;
  /** Provider's payout / transfer / order id — joins payouts.provider_payout_id. */
  providerPayoutId?: string;
  providerStatus?: string;
  failureReason?: string;
  raw: unknown;
}

// ---------------------------------------------------------------------------
// PayoutProvider
// ---------------------------------------------------------------------------

export interface PayoutProvider {
  /** Provider key — matches `ActivePayoutProvider`. */
  readonly name: ActivePayoutProvider;

  /**
   * Start an onboarding session. The frontend uses the returned token to
   * mount the provider's hosted widget (Helcim) or just confirms the email
   * and skips straight to /complete (Tremendous).
   */
  startOnboardingSession(
    userId: string,
    successUrl: string,
    cancelUrl: string,
  ): Promise<PayoutOnboardingSession>;

  /**
   * Push funds to a recipient's stored account. Called by the release worker
   * (next pass). Implementations MAY return isSettled=true synchronously for
   * rails that confirm immediately (gift cards); otherwise the webhook
   * callback drives the payouts.status transition to 'settled'.
   */
  createPayout(input: CreatePayoutInput): Promise<CreatePayoutResult>;

  /**
   * Verify a webhook delivery and return a normalised payload. Returns null
   * when the request is not a payout-related event so the inbound dispatcher
   * can let the PaymentProvider handle it (Helcim shares its webhook URL
   * across acquiring + ACH).
   */
  verifyAndNormalizeWebhook(
    body: string,
    headers: Headers,
  ): Promise<NormalizedPayoutWebhookPayload | null>;
}
