import { apiClient } from "@/lib/api-client";
import type { ApiSuccessResponse } from "@shared/api";
import type { InitCollectionResult } from "@/lib/payment/types";
import type { UsageInvoice, UsageStatement } from "@shared/usage-statement";
import type { CourseCheckoutReceipt } from "@shared/checkout";
import { checkoutService } from "@/lib/services/checkout-service";

// Shared pricing constants
import { FREE_AI_MONTHLY_LIMIT, FREE_AI_MONTHLY_TOKENS } from "@shared/pricing";

// TYPES - mirror backend DTOs; keep in sync with hired.video.Abstractions/Billing/BillingDTOs.cs
export interface SubscriptionSummary {
  planId: string; // free | pro | enterprise
  planName: string;
  /** True for any paid tier (pro, enterprise). Field name kept for backwards
   *  compatibility — backend still ships `isPro`. */
  isPro: boolean;
  price: number;
  currency: string; // e.g., USD
  interval: "month" | "year";
  status: "active" | "trialing" | "past_due" | "canceled" | "inactive";
  currentPeriodStart?: string | null;
  currentPeriodEnd?: string | null;
  cancelAtPeriodEnd: boolean;
  trialEnd?: string | null;
  providerSubscriptionId?: string | null; // For refund and cancellation purposes
  /** A paid subscription is active or trialing. */
  subscribed?: boolean;
  /** End of a time-boxed comp (redeemed coupon / SA override), else null. */
  compedUntil?: string | null;
}

export interface PaymentMethod {
  id: string;
  type: "card" | "us_bank_account";
  brand?: string; // For cards: visa, mastercard, etc. For bank accounts: bank name
  last4?: string;
  expiryMonth?: number; // Only for cards
  expiryYear?: number; // Only for cards
  isDefault: boolean;
}

/** A paid course purchase (receipt) — GET /api/checkout/mine?kind=course. */
export type CoursePurchase = CourseCheckoutReceipt;

export interface Invoice {
  id: string;
  number: string;
  status: "draft" | "open" | "paid" | "void" | "uncollectible" | "pending" | "failed";
  amount: number;
  tax: number;
  total: number;
  currency: string;
  invoiceDate: string;
  dueDate: string;
  paidAt?: string | null;
  description?: string | null;
  downloadUrl?: string | null;
}

export interface AIUsageMonth {
  year: number;
  month: number; // 1-12
  used: number;
  limit?: number | null; // null when unlimited
  remaining?: number | null; // null when unlimited
  isUnlimited: boolean;
}

/**
 * Full token-budget summary returned by /api/billing/token-budget. This is
 * the new shape used by the sidebar AITokenPill, AIUsageLimitBanner, and
 * the "buy more tokens" sheet. It surfaces both the monthly subscription
 * allowance and the purchased pack balance, plus the combined total.
 */
export interface TokenBudget {
  planId: string;
  isPro: boolean;
  isUnlimited: boolean;
  monthly: {
    used: number;
    limit: number | null;     // null when isUnlimited
    remaining: number | null; // null when isUnlimited
    /** ISO timestamp of next monthly reset (1st of next month UTC). */
    resetAt: string;
  };
  pack: {
    balance: number;
  };
  /** monthly.remaining + pack.balance — what the gate checks. null when unlimited. */
  totalAvailable: number | null;
}

/**
 * Inbox-seat add-on state (#809) — extra connected mailboxes a Pro user has
 * purchased above the included base. Mirrors `InboxAddonState` in
 * [InboxSeatAddonService](../../../api/src/services/billing/InboxSeatAddonService.ts).
 */
export interface InboxSeatState {
  /** Extra slots purchased above the included base. */
  quantity: number;
  /** Per-slot monthly price in cents (e.g. 500 = $5/mo). */
  unitPriceCents: number;
  /** quantity × unitPriceCents — the recurring add-on charge. */
  monthlyTotalCents: number;
  /** Included base + purchased quantity = total connectable mailboxes. */
  effectiveCap: number;
  status: "active" | "cancelled" | "past_due";
}

export const billingService = {
  async getSubscription(): Promise<SubscriptionSummary> {
    const res: ApiSuccessResponse<SubscriptionSummary> = await apiClient.get(
      "/api/billing/subscription",
    );
    return res.data;
  },


  async getPaymentMethods(): Promise<PaymentMethod[]> {
    const res: ApiSuccessResponse<PaymentMethod[]> = await apiClient.get(
      "/api/billing/payment-methods",
    );
    return res.data;
  },

  async getInvoices(): Promise<Invoice[]> {
    const res: ApiSuccessResponse<Invoice[]> = await apiClient.get(
      "/api/billing/invoices",
    );
    return res.data;
  },

  /** The caller's paid course purchases (separate ledger from subscription
   *  invoices). Powers the billing "My courses" receipts view. */
  async getCoursePurchases(): Promise<CoursePurchase[]> {
    return checkoutService.listMine("course");
  },

  /**
   * Usage Statement for the current period (or a past month via YYYY-MM).
   * Returns a live preview while the period is open and the frozen
   * `usage_statements` row after month close. Powers
   * UsageStatementPanel (`components/billing/UsageStatementPanel.tsx`).
   */
  async getUsageStatement(month?: string): Promise<UsageStatement> {
    const qs = month ? `?month=${encodeURIComponent(month)}` : "";
    const res: ApiSuccessResponse<UsageStatement> = await apiClient.get(
      `/api/billing/usage-statement${qs}`,
    );
    return res.data;
  },

  /** Closed monthly invoices for the caller, newest first. Includes
   *  `$0 free_zero` Free Invoices alongside paid invoices. */
  async getUsageInvoices(): Promise<UsageInvoice[]> {
    const res: ApiSuccessResponse<UsageInvoice[]> = await apiClient.get(
      "/api/billing/usage-invoices",
    );
    return res.data;
  },

  async getMonthlyAIUsage(): Promise<AIUsageMonth> {
    const res: ApiSuccessResponse<AIUsageMonth> = await apiClient.get(
      "/api/billing/ai-usage/month",
    );
    // Ensure remaining computed when backend didn't provide it.
    // Note: legacy `FREE_AI_MONTHLY_LIMIT` is the request-count value (10).
    // The backend now reports tokens, but this DTO is kept for compatibility
    // with existing AIUsageLimitBanner call sites until they migrate to
    // `getTokenBudget()`.
    const u = res.data;
    if (!u.isUnlimited) {
      const limit = u.limit ?? FREE_AI_MONTHLY_LIMIT;
      const remaining = Math.max(0, limit - (u.used ?? 0));
      return { ...u, limit, remaining };
    }
    return u;
  },

  /**
   * Fetch the full token-budget summary. Use this for any UI that needs to
   * show the pack balance, the next reset time, or the combined total
   * available — the older `getMonthlyAIUsage` only exposes monthly allowance.
   */
  async getTokenBudget(): Promise<TokenBudget> {
    const res: ApiSuccessResponse<TokenBudget> = await apiClient.get(
      "/api/billing/token-budget",
    );
    const t = res.data;
    // Defensive: ensure remaining/totalAvailable are computed if the backend
    // doesn't provide them on a transitional deploy.
    if (!t.isUnlimited) {
      const limit = t.monthly.limit ?? FREE_AI_MONTHLY_TOKENS;
      const monthlyRemaining = Math.max(0, limit - (t.monthly.used ?? 0));
      return {
        ...t,
        monthly: { ...t.monthly, limit, remaining: monthlyRemaining },
        totalAvailable: monthlyRemaining + (t.pack.balance ?? 0),
      };
    }
    return t;
  },

  async createSetupSession(successUrl: string, cancelUrl: string): Promise<string> {
    const res: ApiSuccessResponse<{ Url: string }> = await apiClient.post(
      "/api/payment/create-setup-session",
      { successUrl, cancelUrl }
    );
    return res.data.Url;
  },

  async initPaymentCollection(
    successUrl: string,
    cancelUrl: string,
    amount?: number,
    currency?: string,
    paymentMethodType?: "card" | "us_bank_account" | "any",
  ): Promise<InitCollectionResult> {
    const res = await apiClient.post<InitCollectionResult>(
      "/api/payment/init-collection",
      { successUrl, cancelUrl, amount, currency, paymentMethodType },
    );
    return res.data;
  },

  /** Current inbox-seat add-on state (extra mailboxes above the included base). */
  async getInboxSeats(): Promise<InboxSeatState> {
    const res: ApiSuccessResponse<InboxSeatState> = await apiClient.get(
      "/api/billing/inbox-seats",
    );
    return res.data;
  },

  /**
   * Set the number of extra inbox slots (0–50). Returns the new add-on
   * state so callers can render the updated cap + monthly total without a
   * second round-trip. The local row is authoritative for the connect-time
   * cap; provider recurring-charge sync is handled server-side.
   */
  async setInboxSeats(quantity: number): Promise<InboxSeatState> {
    const res: ApiSuccessResponse<InboxSeatState> = await apiClient.patch(
      "/api/billing/inbox-seats",
      { quantity },
    );
    return res.data;
  },

  async deletePaymentMethod(paymentMethodId: string): Promise<string> {
    const { data } = await apiClient.requestRaw<{ message: string }>(
      `/api/payment/payment-methods/${paymentMethodId}`,
      { method: "DELETE" },
    );
    return data.message;
  },

  /**
   * Persist a payment method captured by the provider's success event so
   * the user sees it in Settings → Payment Methods. Helcim has no public
   * /cards/{token} lookup, so we forward the masked card metadata that
   * HelcimPay reported in its postMessage; the route trusts that hint for
   * Helcim and ignores it for Stripe (which fetches authoritative details).
   */
  async savePaymentMethod(args: {
    paymentMethodId: string;
    setDefault?: boolean;
    type?: "card" | "us_bank_account";
    brand?: string;
    last4?: string;
    expiryMonth?: number;
    expiryYear?: number;
  }): Promise<void> {
    await apiClient.post("/api/payment/save-payment-method", args);
  },
};

