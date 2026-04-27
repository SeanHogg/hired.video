import { useState, useEffect } from "react";
import { billingService } from "@/lib/services/billing-service";
import { usePersonaPreview } from "@/providers/PersonaPreviewProvider";

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

  useEffect(() => {
    let cancelled = false;
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
  }, []);

  // SA tier preview override — lets SuperAdmin see the free/paid UI variants
  // without having to impersonate. Frontend-only: backend still enforces the
  // real tier, so gated endpoints won't actually refuse the SA's requests.
  if (tierPreview) {
    return {
      ...state,
      isPro: tierPreview === "pro",
      planId: tierPreview,
      planName: tierPreview === "pro" ? "Pro" : "Free",
    };
  }

  return state;
}
