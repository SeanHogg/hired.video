import { useMemo } from "react";
import { billingService, type AIUsageMonth } from "@/lib/services/billing-service";
import { FREE_AI_MONTHLY_LIMIT } from "@shared/pricing";
import { useGatedResource } from "@/hooks/use-gated-resource";

export interface AIUsageState {
  used: number;
  limit: number;
  remaining: number;
  isUnlimited: boolean;
  /** True while the first fetch is in flight */
  isLoading: boolean;
  /** Percentage of limit consumed (0-100), 0 for unlimited */
  percentUsed: number;
  /** True when remaining <= 2 and not unlimited */
  isWarning: boolean;
  /** True when remaining === 0 and not unlimited */
  isExhausted: boolean;
}

const now = new Date();
const RAW_DEFAULTS: AIUsageMonth = {
  year: now.getUTCFullYear(),
  month: now.getUTCMonth() + 1,
  used: 0,
  limit: FREE_AI_MONTHLY_LIMIT,
  remaining: FREE_AI_MONTHLY_LIMIT,
  isUnlimited: false,
};

function deriveState(raw: AIUsageMonth, loading: boolean): AIUsageState {
  const used = raw.used ?? 0;
  const limit = raw.limit ?? FREE_AI_MONTHLY_LIMIT;
  const remaining = raw.isUnlimited ? Infinity : Math.max(0, (raw.remaining ?? limit - used));
  const percentUsed = raw.isUnlimited ? 0 : Math.min(100, Math.round((used / limit) * 100));

  return {
    used,
    limit,
    remaining,
    isUnlimited: raw.isUnlimited,
    isLoading: loading,
    percentUsed,
    isWarning: !raw.isUnlimited && remaining <= 2 && remaining > 0,
    isExhausted: !raw.isUnlimited && remaining <= 0,
  };
}

/**
 * Shared hook for AI usage tracking. Inherits the api-ready gate from
 * `useGatedResource` — fires no fetch for anonymous or verification-blocked
 * users; consumers see the free-tier defaults instead.
 */
export function useAIUsage() {
  const { data, isLoading, refresh } = useGatedResource<AIUsageMonth>({
    // Shared across Settings → Billing + the admin Users panel + any future
    // dashboard widget — one cached value across all consumers (gap #1692).
    cacheKey: "billing:ai-usage",
    fetcher: () => billingService.getMonthlyAIUsage(),
    defaults: RAW_DEFAULTS,
  });
  return useMemo(() => ({ ...deriveState(data, isLoading), refresh }), [data, isLoading, refresh]);
}
