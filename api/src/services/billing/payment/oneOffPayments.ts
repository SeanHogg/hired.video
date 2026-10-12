/**
 * One-off purchases, provider-agnostic — the ONE place a server-priced
 * charge is opened in the payment widget and later verified from the
 * provider's own record (never from client claims).
 *
 * Shared by token packs (services/billing/token-packs) and paid boosts
 * (services/advertising/boost-checkout.ts). Helcim today: `getTransaction`
 * re-reads the card transaction by the id the widget reported.
 */

import { tryGetPaymentProvider } from "./index.js";
import type { CollectPaymentMethodResult, PaymentProvider, ProviderTransaction } from "./types.js";
import { loadUserBillingContext } from "../userBillingContext.js";

export interface OneOffPaymentsPort {
  customerIdFor(userId: string): Promise<string>;
  /** False when the provider can't verify one-off charges (no getTransaction). */
  supportsOneOffPurchases: boolean;
  initPurchase(input: {
    customerId: string;
    /** Major units (dollars), server-chosen. */
    amount: number;
    currency: string;
    successUrl: string;
    cancelUrl: string;
  }): Promise<CollectPaymentMethodResult>;
  getTransaction(transactionId: string): Promise<ProviderTransaction | null>;
}

export function buildOneOffPaymentsPort(provider: PaymentProvider): OneOffPaymentsPort {
  return {
    supportsOneOffPurchases: typeof provider.getTransaction === "function",
    async customerIdFor(userId) {
      const ctx = await loadUserBillingContext(userId);
      if (!ctx) throw new Error(`one-off payments: user ${userId} not found`);
      return provider.getOrCreateCustomer(userId, ctx.user.email, ctx.user.name, ctx.billingAddress);
    },
    initPurchase({ customerId, amount, currency, successUrl, cancelUrl }) {
      // A positive amount makes the provider widget a one-off PURCHASE
      // (not a card-on-file verify) for exactly the server-chosen price.
      return provider.initPaymentCollection(customerId, successUrl, cancelUrl, amount, currency, "card");
    },
    async getTransaction(transactionId) {
      return provider.getTransaction ? provider.getTransaction(transactionId) : null;
    },
  };
}

/** The configured provider's one-off port, or null when payments are off. */
export function oneOffPaymentsFromEnv(env: Record<string, string | undefined>): OneOffPaymentsPort | null {
  const provider = tryGetPaymentProvider(env);
  return provider ? buildOneOffPaymentsPort(provider) : null;
}

/** Pure: does the provider's record prove THIS customer paid EXACTLY this? */
export function isApprovedOneOffPayment(
  tx: ProviderTransaction,
  expected: { amountCents: number; currency: string; customerId: string },
): boolean {
  if (!tx.approved) return false;
  if (tx.amountCents !== expected.amountCents) return false;
  if (tx.currency !== expected.currency) return false;
  // When the provider linked the charge to a customer it must be this user's.
  if (tx.customerId && tx.customerId !== expected.customerId) return false;
  return true;
}
