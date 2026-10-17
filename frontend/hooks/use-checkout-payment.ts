/**
 * useCheckoutPayment — pay what's due on ONE /api/checkout checkout, end to
 * end: server-priced pay (amount due) → the app's payment widget
 * (usePaymentFlow) → server-verified confirm. Shared by boosts, paid courses
 * and token packs; each surface keeps its own UI state on top.
 *
 * The server re-reads the transaction from the provider before it fulfils.
 * Closing the widget resolves `cancelled` and leaves the checkout pending.
 */
import { useCallback } from "react";
import { usePaymentFlow } from "@/hooks/use-payment-flow";
import { checkoutService } from "@/lib/services/checkout-service";
import type { CheckoutConfirmDTO } from "@shared/checkout";

export type CheckoutPaymentResult<R> =
  | { status: "paid"; confirmation: R }
  /** Paid; the provider hasn't confirmed yet. */
  | { status: "verifying"; confirmation: R }
  /** Widget closed without paying. */
  | { status: "cancelled" }
  /** `error` keeps the server's typed refusal (apiServerErrorCode). */
  | { status: "error"; error: unknown };

export interface CheckoutPaymentOptions<R> {
  /** Where the provider returns after a redirect flow (default: this page). */
  returnUrl?: string;
  /** Override the confirm step (token packs remember the transaction id
   *  locally before confirming). Defaults to POST /api/checkout/:id/confirm. */
  confirm?: (transactionId: string) => Promise<R>;
}

export function useCheckoutPayment() {
  const { startPayment, cleanup } = usePaymentFlow();

  const pay = useCallback(
    async <R extends { pending: boolean } = CheckoutConfirmDTO>(
      checkoutId: string,
      opts: CheckoutPaymentOptions<R> = {},
    ): Promise<CheckoutPaymentResult<R>> => {
      // Open the checkout ourselves so a typed refusal (PRO_REQUIRED,
      // PAYMENTS_UNAVAILABLE…) keeps its code; the payment hook would
      // flatten it to a message string.
      let collection;
      try {
        collection = (await checkoutService.pay(checkoutId, opts.returnUrl)).collection;
      } catch (error) {
        return { status: "error", error };
      }
      const confirm =
        opts.confirm ?? ((transactionId: string) => checkoutService.confirm(checkoutId, transactionId) as unknown as Promise<R>);
      return new Promise<CheckoutPaymentResult<R>>((resolve) => {
        void startPayment({
          initCollection: async () => collection,
          paymentMethodType: "card",
          onSuccess: async (data) => {
            if (!data.transactionId) return resolve({ status: "error", error: null });
            try {
              const confirmation = await confirm(data.transactionId);
              resolve({ status: confirmation.pending ? "verifying" : "paid", confirmation });
            } catch (error) {
              resolve({ status: "error", error });
            }
          },
          onError: () => resolve({ status: "cancelled" }),
        });
      });
    },
    [startPayment],
  );

  return { pay, cleanup };
}
