import { useState, useEffect } from "react";
import { billingService } from "@/lib/services/billing-service";
import { usePersonaPreview } from "@/providers/PersonaPreviewProvider";
import { useAuth } from "@/lib/auth";
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

const DEFAULT_STATE: SubscriptionState = {
  isPro: false,
  planId: "free",
  planName: "Free",
  loading: true,
  error: null,
};

export function useSubscription(): SubscriptionState {
  const [state, setState] = useState<SubscriptionState>(DEFAULT_STATE);
  const { tierPreview } = usePersonaPreview();
  const { user, isAuthenticated } = useAuth();

  useEffect(() => {
    // Anonymous visitors don't have a subscription — and the endpoint
    // requires auth, so calling it logs out a 401 on every public page
    // (most loudly: /login, /signup). Short-circuit to the default
    // free-tier state instead. Single source of truth: every consumer
    // of useSubscription gets this gate for free, no canFetch prop.
    if (!isAuthenticated) {
      setState({ ...DEFAULT_STATE, loading: false });
      return;
    }
    let cancelled = false;
    setState((prev) => ({ ...prev, loading: true }));
    billingService
      .getSubscription()
      .then((sub) => {
        if (!cancelled) {
          setState({
            isPro: sub.isPro,
            planId: sub.planId,
            planName: sub.planName,
            loading: false,
            error: null,
          });
        }
      })
      .catch(() => {
        if (!cancelled) {
          setState({ ...DEFAULT_STATE, loading: false, error: null });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated]);

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
