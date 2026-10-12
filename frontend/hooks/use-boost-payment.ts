/**
 * useBoostPayment — pay the USD still owed on a boost, end to end:
 *   server-priced checkout (amount due) → the app's payment widget
 *   (usePaymentFlow, same as token packs) → server-verified confirm.
 *
 * The server re-reads the transaction from the provider before it activates
 * the boost. Cancelling the widget leaves the boost `pending_payment`; the
 * caller shows "Finish payment" to retry.
 */
import { useCallback, useState } from "react";
import { usePaymentFlow } from "@/hooks/use-payment-flow";
import { boostService } from "@/lib/services/boost-service";

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
  const { startPayment, cleanup } = usePaymentFlow();
  const [state, setState] = useState<BoostPaymentState>({ status: "idle" });

  const pay = useCallback(
    async (boostId: string): Promise<BoostPaymentState> => {
      setState({ status: "processing" });
      let collection;
      try {
        collection = await boostService.startPayment(boostId);
      } catch {
        const next: BoostPaymentState = { status: "error" };
        setState(next);
        return next;
      }
      return new Promise<BoostPaymentState>((resolve) => {
        const settle = (next: BoostPaymentState) => {
          setState(next);
          resolve(next);
        };
        void startPayment({
          initCollection: async () => collection,
          paymentMethodType: "card",
          onSuccess: async (data) => {
            if (!data.transactionId) return settle({ status: "error" });
            setState({ status: "processing" });
            try {
              const result = await boostService.confirmPayment(boostId, data.transactionId);
              settle(result.activated ? { status: "paid" } : result.pending ? { status: "verifying" } : { status: "paid" });
            } catch {
              settle({ status: "error" });
            }
          },
          onError: () => settle({ status: "cancelled" }),
        });
      });
    },
    [startPayment],
  );

  const reset = useCallback(() => {
    cleanup();
    setState({ status: "idle" });
  }, [cleanup]);

  return { state, pay, reset };
}
