import type {
  AIUsageMonthDTO,
  InvoiceDTO,
  PaymentMethodDTO,
  SubscriptionSummaryDTO,
} from "../../../shared/billing.js";
import { FREE_AI_MONTHLY_LIMIT } from "../../../shared/pricing.js";

export async function getSubscription(): Promise<SubscriptionSummaryDTO> {
  return {
    planId: "free",
    planName: "Free",
    isPremium: false,
    price: 0,
    currency: "USD",
    interval: "month",
    status: "active",
    cancelAtPeriodEnd: false,
  };
}

export async function getPaymentMethods(): Promise<PaymentMethodDTO[]> {
  return [];
}

export async function getInvoices(): Promise<InvoiceDTO[]> {
  return [];
}

export async function getMonthlyAIUsage(): Promise<AIUsageMonthDTO> {
  const now = new Date();
  return {
    year: now.getUTCFullYear(),
    month: now.getUTCMonth() + 1,
    used: 0,
    limit: FREE_AI_MONTHLY_LIMIT,
    remaining: FREE_AI_MONTHLY_LIMIT,
    isUnlimited: false,
  };
}

export async function createSetupSession(successUrl: string, cancelUrl: string): Promise<string> {
  // Placeholder checkout URL
  const encoded = encodeURIComponent(successUrl || cancelUrl || "http://localhost:4003/settings");
  return `http://localhost:4003/settings?billing_setup=1&return=${encoded}`;
}

export async function deletePaymentMethod(paymentMethodId: string): Promise<string> {
  return `Payment method ${paymentMethodId} deleted`;
}
