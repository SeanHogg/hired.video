/**
 * useBoostPayment — pay the USD still owed on a boost through the one
 * checkout flow (useCheckoutPayment: server-priced pay → payment widget →
 * provider-verified confirm), exposed as the state PromoteButton renders.
 *
 * Cancelling the widget leaves the boost `pending_payment`; the caller
 * shows "Finish payment" to retry.
 */
import { useCallback, useState } from "react";
import { useCheckoutPayment } from "@/hooks/use-checkout-payment";
import { boostCheckoutId } from "@/lib/services/boost-service";

export type BoostPaymentState =
  | { status: "idle" }
  | { status: "processing" }
  | { status: "paid" }
  /** Paid; the provider hasn't confirmed yet. */
  | { status: "verifying" }
  /** Widget closed without paying. */
  | { status: "cancelled" }
  | { status: "error" };

export function useBoostPayment() {
  const { pay: payCheckout, cleanup } = useCheckoutPayment();
  const [state, setState] = useState<BoostPaymentState>({ status: "idle" });

  const pay = useCallback(
    async (boostId: string): Promise<BoostPaymentState> => {
      setState({ status: "processing" });
      const result = await payCheckout(boostCheckoutId(boostId));
      const next: BoostPaymentState = { status: result.status };
      setState(next);
      return next;
    },
    [payCheckout],
  );

  const reset = useCallback(() => {
    cleanup();
    setState({ status: "idle" });
  }, [cleanup]);

  return { state, pay, reset };
}
