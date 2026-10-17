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
import { useCheckoutPayment } from "@/hooks/use-checkout-payment";
import { TOKEN_BUDGET_CACHE_KEY } from "@/hooks/use-token-budget";
import { refreshSharedResource } from "@/hooks/use-gated-resource";
import { broadcastTokenBudget } from "@/lib/api-client";
import { tokenPackCheckoutId, tokenPackPurchaseErrorKey } from "@/lib/services/token-pack-service";
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
  const { pay, cleanup } = useCheckoutPayment();
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const [state, setState] = useState<TokenPackPurchaseState>({ status: "idle" });

  const buy = useCallback(
    async (packId: string) => {
      setState({ status: "processing", packId });
      const result = await pay(tokenPackCheckoutId(packId), {
        returnUrl: `${window.location.origin}/settings?tab=billing`,
        confirm: async (transactionId) => {
          if (!userId) throw new Error("signed out");
          return confirmRememberedTokenPack({ packId, transactionId, userId });
        },
      });
      if (result.status === "paid" || result.status === "verifying") {
        broadcastTokenBudget(result.confirmation.tokenBudget);
        await refreshSharedResource(TOKEN_BUDGET_CACHE_KEY);
        setState(
          result.status === "verifying"
            ? { status: "pending", packId }
            : { status: "done", packId, tokensGranted: result.confirmation.tokensGranted },
        );
        return;
      }
      const err = result.status === "error" ? result.error : null;
      setState({ status: "error", packId, errorKey: tokenPackPurchaseErrorKey(err) });
    },
    [pay, userId],
  );

  const reset = useCallback(() => {
    cleanup();
    setState({ status: "idle" });
  }, [cleanup]);

  return { state, buy, reset };
}
