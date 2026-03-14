export interface SubscriptionSummaryDTO {
  planId: string;
  planName: string;
  isPremium: boolean;
  price: number;
  currency: string;
  interval: "month" | "year";
  status: "active" | "trialing" | "past_due" | "canceled" | "inactive";
  cancelAtPeriodEnd: boolean;
}

export interface PaymentMethodDTO {
  id: string;
  type: "card" | "us_bank_account";
  brand?: string;
  last4?: string;
  expiryMonth?: number;
  expiryYear?: number;
  isDefault: boolean;
}

export interface InvoiceDTO {
  id: string;
  number: string;
  status: "draft" | "open" | "paid" | "void" | "uncollectible" | "pending" | "failed";
  amount: number;
  tax: number;
  total: number;
  currency: string;
  invoiceDate: string;
  dueDate: string;
}

export interface AIUsageMonthDTO {
  year: number;
  month: number;
  used: number;
  limit?: number | null;
  remaining?: number | null;
  isUnlimited: boolean;
}
