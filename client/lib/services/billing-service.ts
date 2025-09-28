import { apiClient } from "@/lib/api-client";
import type { ApiSuccessResponse } from "@shared/api";

// Shared pricing constants
import { FREE_AI_MONTHLY_LIMIT } from "@shared/pricing";

// TYPES - mirror backend DTOs; keep in sync with MyVideoResume.Abstractions/Billing/BillingDTOs.cs
export interface SubscriptionSummary {
  planId: string; // free | pro | enterprise
  planName: string;
  isPremium: boolean;
  price: number;
  currency: string; // e.g., USD
  interval: "month" | "year";
  status: "active" | "trialing" | "past_due" | "canceled" | "inactive";
  currentPeriodStart?: string | null;
  currentPeriodEnd?: string | null;
  cancelAtPeriodEnd: boolean;
  trialEnd?: string | null;
}

export interface PaymentMethod {
  id: string;
  type: "card" | "bank_account";
  brand?: string;
  last4?: string;
  expiryMonth?: number;
  expiryYear?: number;
  isDefault: boolean;
}

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

export const billingService = {
  async getSubscription(): Promise<SubscriptionSummary> {
    const res: ApiSuccessResponse<SubscriptionSummary> = await apiClient.get(
      "/api/Billing/subscription",
    );
    return res.data;
  },


  async getPaymentMethods(): Promise<PaymentMethod[]> {
    const res: ApiSuccessResponse<PaymentMethod[]> = await apiClient.get(
      "/api/Billing/payment-methods",
    );
    return res.data;
  },

  async getInvoices(): Promise<Invoice[]> {
    const res: ApiSuccessResponse<Invoice[]> = await apiClient.get(
      "/api/Billing/invoices",
    );
    return res.data;
  },

  async getMonthlyAIUsage(): Promise<AIUsageMonth> {
    const res: ApiSuccessResponse<AIUsageMonth> = await apiClient.get(
      "/api/Billing/ai-usage/month",
    );
    // Ensure remaining computed when backend didn't provide it
    const u = res.data;
    if (!u.isUnlimited) {
      const limit = u.limit ?? FREE_AI_MONTHLY_LIMIT;
      const remaining = Math.max(0, limit - (u.used ?? 0));
      return { ...u, limit, remaining };
    }
    return u;
  },

  async createSetupSession(successUrl: string, cancelUrl: string): Promise<string> {
    const res: ApiSuccessResponse<{ url: string }> = await apiClient.post(
      "/api/Payment/create-setup-session",
      { successUrl, cancelUrl }
    );
    return res.data.url;
  },

  async deletePaymentMethod(paymentMethodId: string): Promise<string> {
    const { data } = await apiClient.requestRaw<{ message: string }>(
      `/api/Payment/payment-methods/${paymentMethodId}`,
      { method: "DELETE" },
    );
    return data.message;
  },


};

