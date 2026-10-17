import { useEffect } from "react";
import { billingService, type TokenBudget } from "@/lib/services/billing-service";
import { FREE_AI_MONTHLY_TOKENS, PRO_AI_MONTHLY_TOKENS, hasTokensForAiCall } from "@shared/pricing";
import { useGatedResource } from "@/hooks/use-gated-resource";
import { readBootstrapSeed } from "@/lib/bootstrap-seed";
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
  /** True when too few tokens remain to start another AI call — the same
   *  rule the server gate enforces (shared/pricing.ts hasTokensForAiCall). */
  isExhausted: boolean;

  /** True while the first fetch is in flight. */
  isLoading: boolean;
}

const RAW_DEFAULTS: TokenBudget = {
  planId: "free",
  isPro: false,
  isUnlimited: false,
  monthly: {
    used: 0,
    limit: FREE_AI_MONTHLY_TOKENS,
    remaining: FREE_AI_MONTHLY_TOKENS,
    resetAt: new Date(
      Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth() + 1, 1),
    ).toISOString(),
  },
  pack: { balance: 0 },
  totalAvailable: FREE_AI_MONTHLY_TOKENS,
};

function deriveState(raw: TokenBudget, loading: boolean): TokenBudgetState {
  if (raw.isUnlimited) {
    return {
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
    isWarning: monthlyRemaining <= monthlyLimit * 0.1 && hasTokensForAiCall(totalAvailable),
    isExhausted: !hasTokensForAiCall(totalAvailable),
    isLoading: loading,
  };
}

/**
 * Shared hook for token-budget tracking. Inherits the api-ready gate from
 * `useGatedResource` — anonymous and verification-blocked users see the
 * free-tier defaults; only api-ready users hit the wire.
 *
 * AI-metered endpoints piggy-back the live token-budget onto every response
 * envelope (see `attachTokenBudget` middleware). The api-client broadcasts
 * a "token-budget:update" event whenever it sees one — we listen and patch
 * the cached resource in place so the pill updates instantly with zero
 * extra round-trips.
 */
/** Shared-cache key for the token budget (see `refreshSharedResource`). */
export const TOKEN_BUDGET_CACHE_KEY = "billing:token-budget";

export function useTokenBudget() {
  const { tierPreview } = usePersonaPreview();
  const { data, isLoading, isReady, refresh, setData } = useGatedResource<TokenBudget>({
    // Shared across the sidebar pill, AI panel, studio chrome — any number
    // of mounted consumers share one cached value, one in-flight fetch, and
    // one optimistic-update channel (gap #1692). The `token-budget:update`
    // event below now propagates to every consumer via the shared store.
    cacheKey: TOKEN_BUDGET_CACHE_KEY,
    fetcher: () => billingService.getTokenBudget(),
    defaults: RAW_DEFAULTS,
    // /api/bootstrap already carried the budget — adopt it and skip the
    // first round-trip (the update listener below attaches too late to
    // catch bootstrap's broadcast).
    seedFn: () => readBootstrapSeed<TokenBudget>("tokenBudget"),
  });

  useEffect(() => {
    if (!isReady) return;
    function onUpdate(event: Event) {
      const detail = (event as CustomEvent<TokenBudget>).detail;
      if (!detail || typeof detail !== "object") return;
      setData(detail);
    }
    window.addEventListener("token-budget:update", onUpdate);
    return () => window.removeEventListener("token-budget:update", onUpdate);
  }, [isReady, setData]);

  const state = deriveState(data, isLoading);

  // SA tier preview override — synthesize free/pro budget shape so the SA can
  // see the token-pill / banner UI without impersonating. Frontend-only.
  const effective: TokenBudgetState = tierPreview
    ? tierPreview === "pro"
      ? {
          ...state,
          planId: "pro",
          isPro: true,
          isUnlimited: false,
          monthlyLimit: PRO_AI_MONTHLY_TOKENS,
          monthlyUsed: 0,
          monthlyRemaining: PRO_AI_MONTHLY_TOKENS,
          packBalance: 0,
          totalAvailable: PRO_AI_MONTHLY_TOKENS,
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
