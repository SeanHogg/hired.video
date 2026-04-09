import { useState, useEffect, useCallback } from "react";
import { billingService, type AIUsageMonth } from "@/lib/services/billing-service";
import { FREE_AI_MONTHLY_LIMIT } from "@shared/pricing";
import { useAuth } from "@/lib/auth";

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

const DEFAULTS: AIUsageState = {
  used: 0,
  limit: FREE_AI_MONTHLY_LIMIT,
  remaining: FREE_AI_MONTHLY_LIMIT,
  isUnlimited: false,
  isLoading: true,
  percentUsed: 0,
  isWarning: false,
  isExhausted: false,
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
 * Shared hook for AI usage tracking.
 * Fetches usage on mount and exposes a `refresh` callback
 * that any consumer can call after an AI request completes.
 */
export function useAIUsage() {
  const { isAuthenticated } = useAuth();
  const [state, setState] = useState<AIUsageState>(DEFAULTS);

  const refresh = useCallback(async () => {
    if (!isAuthenticated) return;
    try {
      const usage = await billingService.getMonthlyAIUsage();
      setState(deriveState(usage, false));
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

  return { ...state, refresh };
}
