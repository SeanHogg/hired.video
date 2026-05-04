import { billingService, type SubscriptionSummary } from "@/lib/services/billing-service";
import { usePersonaPreview } from "@/providers/PersonaPreviewProvider";
import { useAuth } from "@/lib/auth";
import { useGatedResource } from "@/hooks/use-gated-resource";
import { USER_ROLES } from "@shared/user-roles";

/**
 * `isPro` here is the SINGLE permission primitive for "can the user use
 * Pro features." It is NOT "is the user paying for Pro" — that's billing
 * state, and the only surface that needs it is BillingManagement, which
 * reads `billingService.getSubscription()` directly.
 *
 * Resolution order (matches `requirePro` on the server):
 *   1. `tierPreview` (SA testing UI variants) wins — explicit override.
 *   2. SUPER_ADMIN / ADMIN role bypasses to Pro. The platform's privileged
 *      roles are by definition entitled to every paid feature.
 *   3. Otherwise, the user's real billing subscription.
 *
 * Adding new gates? Use `useSubscription().isPro`. Don't recompute
 * `isPro || isSuperAdmin` at the call site — that pattern is what this
 * hook exists to remove.
 */

export interface SubscriptionState {
  isPro: boolean;
  planId: string;
  planName: string;
  loading: boolean;
  error: string | null;
}

const RAW_DEFAULTS: SubscriptionSummary = {
  isPro: false,
  planId: "free",
  planName: "Free",
} as SubscriptionSummary;

export function useSubscription(): SubscriptionState {
  const { tierPreview } = usePersonaPreview();
  const { user } = useAuth();
  const { data, isLoading } = useGatedResource<SubscriptionSummary>({
    fetcher: () => billingService.getSubscription(),
    defaults: RAW_DEFAULTS,
  });

  const state: SubscriptionState = {
    isPro: data.isPro,
    planId: data.planId,
    planName: data.planName,
    loading: isLoading,
    error: null,
  };

  // 1. SA tier preview override — explicit choice to test a tier.
  //    Wins over privileged-role bypass so SA can see the free-tier UI.
  if (tierPreview) {
    return {
      ...state,
      isPro: tierPreview === "pro",
      planId: tierPreview,
      planName: tierPreview === "pro" ? "Pro" : "Free",
    };
  }

  // 2. Privileged-role bypass — SUPER_ADMIN and ADMIN are entitled to
  //    every paid feature, same as the server's `requirePro` middleware.
  //    This is the single primitive — no consumer should re-check role.
  const role = user?.role;
  if (role === USER_ROLES.SUPER_ADMIN || role === USER_ROLES.ADMIN) {
    return {
      ...state,
      isPro: true,
      // Surface that the access is privileged, not paid, so any future
      // copy that branches on planName ("Next billing…") doesn't lie.
      planId: state.planId || "admin",
      planName: "Admin",
      loading: false,
    };
  }

  // 3. Real billing state.
  return state;
}
