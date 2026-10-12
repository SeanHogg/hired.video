import { z } from "zod";

// ---------------------------------------------------------------------------
// Request schemas — shared with the frontend so client-side forms can
// validate before hitting the API, and the backend handler has one source
// of truth to parse against. Moving these out of `routes/*-handlers.ts`
// closed 2026-04-20 drift where the frontend forms and the backend
// schemas silently fell out of sync.
// ---------------------------------------------------------------------------

export const RefundRequestSchema = z.object({
  reason: z.string().min(1, "reason is required"),
  invoiceId: z.string().optional().nullable(),
  // Cents over the wire; the handler converts to the decimal-dollars string
  // that the `refund_requests.amount` numeric column expects.
  amountCents: z.number().int().min(0).optional().nullable(),
});
export type RefundRequestInput = z.infer<typeof RefundRequestSchema>;

export const CancelAccountSchema = z.object({
  reason: z.string().optional(),
  requestRefund: z.boolean().optional(),
});
export type CancelAccountInput = z.infer<typeof CancelAccountSchema>;

export interface SubscriptionSummaryDTO {
  planId: string;
  planName: string;
  isPro: boolean;
  price: number;
  currency: string;
  interval: "month" | "year";
  status: "active" | "trialing" | "past_due" | "canceled" | "inactive";
  cancelAtPeriodEnd: boolean;
  /** A paid (non-free) subscription is active or trialing. */
  subscribed: boolean;
  /** When a time-boxed comp (SuperAdmin override or redeemed coupon) is
   *  what grants the current plan, its end (ISO); otherwise null. */
  compedUntil: string | null;
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

/**
 * Canonical token-budget shape returned by `/api/Billing/token-budget` AND
 * piggy-backed onto every AI response envelope (see `attachTokenBudget`
 * middleware). Clients read `tokenBudget` off any AI response to update
 * their UI in real time without issuing a second request.
 */
export interface TokenBudgetDTO {
  planId: string;
  isPro: boolean;
  isUnlimited: boolean;
  monthly: {
    used: number;
    /** null when isUnlimited. */
    limit: number | null;
    /** null when isUnlimited. */
    remaining: number | null;
    /** ISO timestamp of the next monthly reset (1st of next month UTC). */
    resetAt: string;
  };
  pack: {
    balance: number;
  };
  /** monthly.remaining + pack.balance — null when isUnlimited. */
  totalAvailable: number | null;
}
