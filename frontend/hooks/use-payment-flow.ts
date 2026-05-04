/**
 * usePaymentFlow — provider-agnostic payment-collection hook.
 *
 * Delegates the actual SDK work to `lib/payment/<provider>-client.ts`.  The
 * hook owns nothing provider-specific; it just:
 *   1. Calls POST /api/payment/init-collection
 *   2. Follows the redirectUrl when the server says so
 *   3. Otherwise picks the right PaymentClient by `providerName` and starts it
 *
 * To swap providers, change PAYMENT_PROVIDER on the backend; the registry in
 * `lib/payment/index.ts` will route to the matching client.
 */

import { useCallback, useRef, useState } from "react";
import { billingService } from "@/lib/services/billing-service";
import {
  getPaymentClient,
  type PaymentClient,
  type PaymentSuccessData,
} from "@/lib/payment";

export interface PaymentFlowOptions {
  /** Cart total in dollars (e.g. 9.95). 0 for card-on-file / verify. */
  amount?: number;
  currency?: string;
  successUrl?: string;
  cancelUrl?: string;
  onSuccess?: (data: PaymentSuccessData) => void;
  onError?: (error: string) => void;
}

export type { PaymentSuccessData };

export function usePaymentFlow() {
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const activeClientRef = useRef<PaymentClient | null>(null);

  const cleanup = useCallback(() => {
    activeClientRef.current?.cleanup();
    activeClientRef.current = null;
  }, []);

  const startPayment = useCallback(async (options: PaymentFlowOptions = {}) => {
    const {
      amount,
      currency,
      successUrl = `${window.location.origin}/checkout/success`,
      cancelUrl = `${window.location.origin}/checkout?cancelled=true`,
      onSuccess,
      onError,
    } = options;

    setIsProcessing(true);
    setError(null);

    try {
      const result = await billingService.initPaymentCollection(successUrl, cancelUrl, amount, currency);

      // Hosted-page flow — same for any provider.
      if (result.flowType === "redirect" && result.redirectUrl) {
        window.location.href = result.redirectUrl;
        return;
      }

      const client = getPaymentClient(result.providerName);
      if (!client) {
        throw new Error(
          `No frontend client registered for payment provider "${result.providerName ?? "unknown"}"`,
        );
      }

      activeClientRef.current = client;
      await client.start(result, {
        onSuccess: (data) => {
          setIsProcessing(false);
          activeClientRef.current = null;
          onSuccess?.(data);
        },
        onError: (msg) => {
          setIsProcessing(false);
          setError(msg);
          activeClientRef.current = null;
          onError?.(msg);
        },
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Payment initialisation failed";
      setError(msg);
      onError?.(msg);
      setIsProcessing(false);
    }
  }, []);

  return {
    startPayment,
    isProcessing,
    error,
    cleanup,
  };
}
