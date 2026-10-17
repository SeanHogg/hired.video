/**
 * Checkout-kind port — every server-priced one-off purchase (boost, job
 * boost, course, token pack) implements this ONE shape, and routes/checkout.ts dispatches
 * through the registry (registry.ts) instead of a route per product.
 *
 * Every kind takes its money through OneOffPaymentsPort: `pay` opens the
 * provider widget for the server-chosen amount, `confirm` re-reads the
 * provider's transaction and fulfils only an approved, exact, single-use
 * payment (isApprovedOneOffPayment). Contract: shared/checkout.ts.
 */
import type {
  CheckoutConfirmDTO,
  CheckoutDTO,
  CheckoutErrorKind,
  CheckoutKind,
  CheckoutPayDTO,
  CheckoutReceiptDTO,
  StartCheckoutInputOf,
} from "../../../../../shared/checkout.js";
import type { OneOffPaymentsPort } from "../payment/oneOffPayments.js";
import type { CollectPaymentMethodResult } from "../payment/types.js";

/** Typed refusal; routes/checkout.ts maps `kind` to the HTTP status. */
export class CheckoutError extends Error {
  constructor(
    public readonly kind: CheckoutErrorKind,
    message: string,
  ) {
    super(message);
    this.name = "CheckoutError";
  }
}

export interface CheckoutContext {
  userId: string;
  env: Record<string, string | undefined>;
  /** Null when no payment provider is configured. */
  payments: OneOffPaymentsPort | null;
}

export interface CheckoutUrls {
  successUrl: string;
  cancelUrl: string;
}

export interface CheckoutKindHandler<K extends CheckoutKind> {
  readonly kind: K;
  /** Price server-side and open (or resume) the checkout. */
  start(ctx: CheckoutContext, input: StartCheckoutInputOf<K>): Promise<CheckoutDTO<K>>;
  /** The caller's checkout by its key; NOT_FOUND / FORBIDDEN otherwise. */
  get(ctx: CheckoutContext, key: string): Promise<CheckoutDTO<K>>;
  /** Open the payment widget for exactly the amount due. */
  pay(ctx: CheckoutContext, key: string, urls: CheckoutUrls): Promise<CheckoutPayDTO<CollectPaymentMethodResult>>;
  /** Verify the provider transaction, then fulfil (idempotent). */
  confirm(ctx: CheckoutContext, key: string, transactionId: string): Promise<CheckoutConfirmDTO<K>>;
  /** Completed purchases for receipts views (kinds that keep receipts). */
  listMine?(ctx: CheckoutContext): Promise<CheckoutReceiptDTO[]>;
}

export type CheckoutRegistry = { [K in CheckoutKind]: CheckoutKindHandler<K> };

/** Shared guard: the provider must be able to verify one-off charges. */
export function requireOneOffPayments(payments: OneOffPaymentsPort | null): OneOffPaymentsPort {
  if (!payments || !payments.supportsOneOffPurchases) {
    throw new CheckoutError("PAYMENTS_UNAVAILABLE", "Payments are unavailable right now");
  }
  return payments;
}

export const CHECKOUT_CURRENCY = "USD";
