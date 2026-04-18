import { useState, useEffect, useCallback } from "react";
import { billingService, type TokenBudget } from "@/lib/services/billing-service";
import { FREE_AI_MONTHLY_TOKENS } from "@shared/pricing";
import { useAuth } from "@/lib/auth";
import { usePersonaPreview } from "@/providers/PersonaPreviewProvider";

/**
 * Derived state for the AITokenPill / banner / buy-more sheet. Wraps the
 * raw `TokenBudget` DTO with display helpers (warning state, percent used,
 * formatted strings) so consumers don't reimplement the math.
 */
export interface TokenBudgetState {
  /** Plan slug — "free" | "pro" | "admin". */
  planId: string;
  isPro: boolean;
  /** True for SuperAdmin / Admin internal users — bypass all gates. */
  isUnlimited: boolean;

  /** Tokens consumed from the monthly bucket so far this calendar month. */
  monthlyUsed: number;
  /** Monthly token allowance from the current plan. */
  monthlyLimit: number;
  /** Tokens still available in the monthly bucket. */
  monthlyRemaining: number;
  /** Tokens available from purchased one-off packs. */
  packBalance: number;
  /** monthlyRemaining + packBalance — what the next call can spend. */
  totalAvailable: number;

  /** ISO timestamp of the next monthly reset (1st of next month UTC). */
  resetAt: string;

  /** 0–100 — percent of MONTHLY allowance consumed. Always 0 when unlimited. */
  percentUsed: number;
  /** True when remaining ≤ 10% of monthly limit and not unlimited. */
  isWarning: boolean;
  /** True when totalAvailable === 0 and not unlimited. */
  isExhausted: boolean;

  /** True while the first fetch is in flight. */
  isLoading: boolean;
}

const DEFAULTS: TokenBudgetState = {
  planId: "free",
  isPro: false,
  isUnlimited: false,
  monthlyUsed: 0,
  monthlyLimit: FREE_AI_MONTHLY_TOKENS,
  monthlyRemaining: FREE_AI_MONTHLY_TOKENS,
  packBalance: 0,
  totalAvailable: FREE_AI_MONTHLY_TOKENS,
  resetAt: new Date(
    Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth() + 1, 1),
  ).toISOString(),
  percentUsed: 0,
  isWarning: false,
  isExhausted: false,
  isLoading: true,
};

function deriveState(raw: TokenBudget, loading: boolean): TokenBudgetState {
  if (raw.isUnlimited) {
    return {
      ...DEFAULTS,
      planId: raw.planId,
      isPro: raw.isPro,
      isUnlimited: true,
      monthlyUsed: raw.monthly.used,
      monthlyLimit: Number.POSITIVE_INFINITY,
      monthlyRemaining: Number.POSITIVE_INFINITY,
      packBalance: raw.pack.balance,
      totalAvailable: Number.POSITIVE_INFINITY,
      resetAt: raw.monthly.resetAt,
      percentUsed: 0,
      isWarning: false,
      isExhausted: false,
      isLoading: loading,
    };
  }

  const monthlyLimit = raw.monthly.limit ?? FREE_AI_MONTHLY_TOKENS;
  const monthlyUsed = raw.monthly.used ?? 0;
  const monthlyRemaining = Math.max(0, monthlyLimit - monthlyUsed);
  const packBalance = raw.pack.balance ?? 0;
  const totalAvailable = monthlyRemaining + packBalance;
  const percentUsed = Math.min(100, Math.round((monthlyUsed / monthlyLimit) * 100));

  return {
    planId: raw.planId,
    isPro: raw.isPro,
    isUnlimited: false,
    monthlyUsed,
    monthlyLimit,
    monthlyRemaining,
    packBalance,
    totalAvailable,
    resetAt: raw.monthly.resetAt,
    percentUsed,
    isWarning: monthlyRemaining <= monthlyLimit * 0.1 && totalAvailable > 0,
    isExhausted: totalAvailable <= 0,
    isLoading: loading,
  };
}

/**
 * Shared hook for token-budget tracking. Replaces `useAIUsage` (which only
 * exposes the monthly bucket). Fetches on mount and exposes a `refresh`
 * callback that any consumer can call after an AI request completes.
 */
export function useTokenBudget() {
  const { isAuthenticated } = useAuth();
  const { tierPreview } = usePersonaPreview();
  const [state, setState] = useState<TokenBudgetState>(DEFAULTS);

  const refresh = useCallback(async () => {
    if (!isAuthenticated) return;
    try {
      const raw = await billingService.getTokenBudget();
      setState(deriveState(raw, false));
    } catch {
      // Silently fail — keep previous state
      setState((prev) => ({ ...prev, isLoading: false }));
    }
  }, [isAuthenticated]);

  useEffect(() => {
    if (isAuthenticated) {
      refresh();
    } else {
      setState(DEFAULTS);
    }
  }, [isAuthenticated, refresh]);

  // AI-metered endpoints piggy-back the live token-budget onto every
  // response envelope (see `attachTokenBudget` middleware). The api-client
  // broadcasts a "token-budget:update" event whenever it sees one — we
  // listen and apply it so the pill updates the instant an AI call
  // completes, with zero extra round-trips.
  useEffect(() => {
    if (!isAuthenticated) return;
    function onUpdate(event: Event) {
      const detail = (event as CustomEvent<TokenBudget>).detail;
      if (!detail || typeof detail !== "object") return;
      setState(deriveState(detail, false));
    }
    window.addEventListener("token-budget:update", onUpdate);
    return () => window.removeEventListener("token-budget:update", onUpdate);
  }, [isAuthenticated]);

  // SA tier preview override — synthesize free/pro budget shape so the SA can
  // see the token-pill / banner UI without impersonating. Frontend-only.
  const effective: TokenBudgetState = tierPreview
    ? tierPreview === "pro"
      ? {
          ...state,
          planId: "pro",
          isPro: true,
          isUnlimited: false,
          monthlyLimit: 1_000_000,
          monthlyUsed: 0,
          monthlyRemaining: 1_000_000,
          packBalance: 0,
          totalAvailable: 1_000_000,
          percentUsed: 0,
          isWarning: false,
          isExhausted: false,
        }
      : {
          ...state,
          planId: "free",
          isPro: false,
          isUnlimited: false,
          monthlyLimit: FREE_AI_MONTHLY_TOKENS,
          monthlyUsed: 0,
          monthlyRemaining: FREE_AI_MONTHLY_TOKENS,
          packBalance: 0,
          totalAvailable: FREE_AI_MONTHLY_TOKENS,
          percentUsed: 0,
          isWarning: false,
          isExhausted: false,
        }
    : state;

  return { ...effective, refresh };
}

/**
 * Format a token count for display: 1234 → "1.2K", 1234567 → "1.2M".
 * Used by the sidebar pill and the banner so the same digits format the
 * same everywhere.
 */
export function formatTokens(tokens: number): string {
  if (!Number.isFinite(tokens)) return "∞";
  if (tokens >= 1_000_000) return (tokens / 1_000_000).toFixed(tokens % 1_000_000 === 0 ? 0 : 1) + "M";
  if (tokens >= 1_000) return (tokens / 1_000).toFixed(tokens % 1_000 === 0 ? 0 : 1) + "K";
  return tokens.toString();
}
