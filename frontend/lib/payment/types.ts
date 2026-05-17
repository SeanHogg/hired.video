/**
 * Frontend payment-client abstraction.
 *
 * Mirrors the backend's PaymentProvider interface so the frontend can be
 * swapped from Helcim → Stripe → Braintree by adding a new module under
 * `lib/payment/<name>-client.ts` and registering it in `index.ts`.
 *
 * The `usePaymentFlow` hook is provider-agnostic — it dispatches to the
 * correct client based on `providerName` returned by the API.
 */

/**
 * Sub-flow for embedded providers — clients use this to choose between an
 * iFrame modal and an inline page-rendered form (e.g. Helcim.js v2).
 */
export type EmbeddedCollectionFlow = "modal" | "inline";

/** Server response shape from POST /api/payment/init-collection. */
export interface InitCollectionResult {
  flowType: "embedded" | "redirect";
  /** Sub-flow indicator when flowType === "embedded". */
  collectionFlow?: EmbeddedCollectionFlow;
  providerName?: string;
  clientSecret?: string;
  checkoutToken?: string;
  sdkScriptUrl?: string;
  redirectUrl?: string;
  /** Charge amount in major currency units; undefined for card-on-file. */
  amount?: number;
  /** ISO-4217 currency code. */
  currency?: string;
  helcimJsConfig?: {
    token: string;
    scriptUrl: string;
  };
}

/** Normalised success payload — provider-agnostic. */
export interface PaymentSuccessData {
  /** Opaque token from the provider (cardToken for Helcim, pm_xxx for Stripe). */
  paymentMethodToken: string;
  transactionId?: string;
  /** Masked card number, e.g. "5454****5454" */
  maskedCard?: string;
  /** Last four digits of the card, parsed from `maskedCard`. */
  last4?: string;
  cardBrand?: string;
  amount?: string;
  /** Raw provider-specific data for debugging. */
  raw?: unknown;
}

export interface PaymentClientCallbacks {
  onSuccess: (data: PaymentSuccessData) => void;
  onError: (msg: string) => void;
}

/**
 * One implementation per payment provider.  Owns the provider's SDK loading,
 * embedded-widget lifecycle, and event-to-PaymentSuccessData translation.
 */
export interface PaymentClient {
  readonly name: string;
  /**
   * Begin the provider's embedded flow.  Returns when the widget has been
   * opened; the callbacks fire asynchronously when the user completes,
   * cancels, or errors.
   */
  start(result: InitCollectionResult, callbacks: PaymentClientCallbacks): Promise<void>;
  /** Tear down DOM/listeners.  Safe to call repeatedly. */
  cleanup(): void;
}
