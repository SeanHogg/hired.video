import { useState, useEffect } from "react";
import { billingService } from "@/lib/services/billing-service";

export interface SubscriptionState {
  isPremium: boolean;
  planId: string;
  planName: string;
  loading: boolean;
  error: string | null;
}

const DEFAULT_STATE: SubscriptionState = {
  isPremium: false,
  planId: "free",
  planName: "Free",
  loading: true,
  error: null,
};

export function useSubscription(): SubscriptionState {
  const [state, setState] = useState<SubscriptionState>(DEFAULT_STATE);

  useEffect(() => {
    let cancelled = false;
    billingService
      .getSubscription()
      .then((sub) => {
        if (!cancelled) {
          setState({
            isPremium: sub.isPremium,
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

  return state;
}
