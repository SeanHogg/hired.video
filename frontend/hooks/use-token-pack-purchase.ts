/**
 * useTokenPackPurchase — buy one token pack end to end:
 *   server-priced checkout → payment widget → server-verified confirm →
 *   refresh every token-budget consumer (pill, banner, settings card).
 *
 * The amount never comes from the client: the server opens the widget for the
 * pack's price and credits it only after re-reading the provider transaction.
 * The transaction id is remembered in this browser until the server has it
 * (lib/billing/pending-token-pack-confirms.ts), and the server records the
 * charge as pending before its check — a paid pack is never lost (#2352).
 */
import { useCallback, useState } from "react";
import { usePaymentFlow } from "@/hooks/use-payment-flow";
import { TOKEN_BUDGET_CACHE_KEY } from "@/hooks/use-token-budget";
import { refreshSharedResource } from "@/hooks/use-gated-resource";
import { broadcastTokenBudget } from "@/lib/api-client";
import { tokenPackService, tokenPackPurchaseErrorKey } from "@/lib/services/token-pack-service";
import { confirmRememberedTokenPack } from "@/lib/billing/pending-token-pack-confirms";
import { useAuth } from "@/lib/auth";

export type TokenPackPurchaseState =
  | { status: "idle" }
  | { status: "processing"; packId: string }
  | { status: "done"; packId: string; tokensGranted: number }
  /** Paid; the provider hasn't confirmed yet — the server credits it shortly. */
  | { status: "pending"; packId: string }
  | { status: "error"; packId: string; errorKey: string };

export function useTokenPackPurchase() {
  const { startPayment, cleanup } = usePaymentFlow();
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const [state, setState] = useState<TokenPackPurchaseState>({ status: "idle" });

  const fail = useCallback((packId: string, err: unknown) => {
    setState({ status: "error", packId, errorKey: tokenPackPurchaseErrorKey(err) });
  }, []);

  const buy = useCallback(
    async (packId: string) => {
      setState({ status: "processing", packId });
      // Start the checkout ourselves so a typed refusal (PRO_REQUIRED,
      // PAYMENTS_UNAVAILABLE…) keeps its code; the payment hook would
      // flatten it to a message string.
      let collection;
      try {
        collection = await tokenPackService.startCheckout(packId);
      } catch (err) {
        fail(packId, err);
        return;
      }
      await startPayment({
        initCollection: async () => collection,
        paymentMethodType: "card",
        onSuccess: async (data) => {
          if (!data.transactionId || !userId) {
            fail(packId, null);
            return;
          }
          setState({ status: "processing", packId });
          try {
            const result = await confirmRememberedTokenPack({ packId, transactionId: data.transactionId, userId });
            broadcastTokenBudget(result.tokenBudget);
            await refreshSharedResource(TOKEN_BUDGET_CACHE_KEY);
            setState(
              result.pending
                ? { status: "pending", packId }
                : { status: "done", packId, tokensGranted: result.tokensGranted },
            );
          } catch (err) {
            fail(packId, err);
          }
        },
        onError: () => fail(packId, null),
      });
    },
    [startPayment, fail, userId],
  );

  const reset = useCallback(() => {
    cleanup();
    setState({ status: "idle" });
  }, [cleanup]);

  return { state, buy, reset };
}
