/**
 * Token-usage alerts — tell a user when an AI call pushes them past 80% of
 * their monthly allowance, and when they can no longer start another AI call.
 *
 * Detection is pure and edge-triggered: it compares the budget the ledger saw
 * BEFORE the debit with the state after it, so each threshold fires once per
 * crossing (once a month, or again after a pack top-up is spent) without any
 * "already notified" bookkeeping. Delivery goes through the shared
 * notification dispatcher (bell always; push/email honour preferences).
 */
import { hasTokensForAiCall } from "../../../../shared/pricing.js";
import type { TokenBudgetSummary } from "../../services/billing/BillingService.js";
import type { TokenDebitSource } from "./token-debit.js";

export type TokenUsageAlert = "low" | "exhausted";

/** Share of the monthly allowance at which the "running low" alert fires. */
export const TOKEN_LOW_ALERT_RATIO = 0.8;

export function tokenUsageAlertFor(
  before: Pick<TokenBudgetSummary, "monthlyUsed" | "monthlyLimit" | "packBalance" | "totalAvailable" | "isUnlimited">,
  debit: { tokens: number; source: TokenDebitSource },
): TokenUsageAlert | null {
  if (before.isUnlimited || !Number.isFinite(before.monthlyLimit) || before.monthlyLimit <= 0) return null;

  const usedAfter = debit.source === "monthly" ? before.monthlyUsed + debit.tokens : before.monthlyUsed;
  const packAfter = debit.source === "pack" ? Math.max(0, before.packBalance - debit.tokens) : before.packBalance;
  const availableAfter = Math.max(0, before.monthlyLimit - usedAfter) + packAfter;

  if (hasTokensForAiCall(before.totalAvailable) && !hasTokensForAiCall(availableAfter)) return "exhausted";

  const threshold = before.monthlyLimit * TOKEN_LOW_ALERT_RATIO;
  if (before.monthlyUsed < threshold && usedAfter >= threshold && packAfter === 0) return "low";
  return null;
}

export interface TokenUsageAlertMessage {
  type: "ai_tokens_low" | "ai_tokens_exhausted";
  title: string;
  message: string;
  url: string;
  email: boolean;
}

/** Copy + destination for an alert. Pro users top up with a pack (Settings →
 *  Billing); free users upgrade to Pro. */
export function tokenUsageAlertMessage(alert: TokenUsageAlert, isPro: boolean): TokenUsageAlertMessage {
  const url = isPro ? "/settings?tab=billing" : "/pricing";
  if (alert === "low") {
    return {
      type: "ai_tokens_low",
      title: "You've used 80% of this month's AI tokens",
      message: isPro
        ? "Add a token pack any time so your AI tools keep working until the monthly reset."
        : "Upgrade to Pro for a bigger monthly allowance.",
      url,
      email: false,
    };
  }
  return {
    type: "ai_tokens_exhausted",
    title: "You're out of AI tokens for this month",
    message: isPro
      ? "Buy a token pack to keep using AI tools now, or wait for the monthly reset."
      : "Upgrade to Pro to keep using AI tools this month.",
    url,
    email: true,
  };
}
