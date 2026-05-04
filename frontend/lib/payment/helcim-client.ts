/**
 * Helcim — embedded modal flow (HelcimPay.js).
 *
 * Loads the HelcimPay.js SDK on demand, opens the iFrame overlay via
 * `appendHelcimPayIframe(checkoutToken)`, and translates `postMessage`
 * events into the normalised PaymentSuccessData.
 */

import type {
  PaymentClient,
  PaymentClientCallbacks,
  InitCollectionResult,
} from "./types";
import { loadScript } from "./script-loader";

declare global {
  interface Window {
    appendHelcimPayIframe?: (checkoutToken: string) => void;
    removeHelcimPayIframe?: () => void;
    helcimProcess?: () => void;
  }
}

class HelcimPaymentClient implements PaymentClient {
  readonly name = "helcim";
  private listener: ((e: MessageEvent) => void) | null = null;

  async start(result: InitCollectionResult, callbacks: PaymentClientCallbacks): Promise<void> {
    if (!result.checkoutToken || !result.sdkScriptUrl) {
      callbacks.onError("Helcim init response missing checkoutToken / sdkScriptUrl");
      return;
    }

    await loadScript(result.sdkScriptUrl);
    if (!window.appendHelcimPayIframe) {
      callbacks.onError("Helcim SDK failed to load");
      return;
    }

    const handler = (event: MessageEvent) => {
      const data = event.data;
      if (!data || typeof data !== "object") return;

      if (data.eventName === "helcim-pay-success" || data.eventStatus === "APPROVED") {
        this.cleanup();
        callbacks.onSuccess({
          paymentMethodToken: data.cardToken ?? data.data?.cardToken ?? "",
          transactionId: data.transactionId ?? data.data?.transactionId,
          maskedCard: data.cardNumber ?? data.data?.cardNumber,
          cardBrand: data.cardType ?? data.data?.cardType,
          amount: data.amount ?? data.data?.amount,
          raw: data,
        });
      } else if (
        data.eventName === "helcim-pay-error" ||
        data.eventName === "helcim-pay-abort" ||
        data.eventStatus === "ABORTED"
      ) {
        this.cleanup();
        callbacks.onError(data.message ?? "Payment was cancelled");
      }
    };

    this.listener = handler;
    window.addEventListener("message", handler);
    window.appendHelcimPayIframe(result.checkoutToken);
  }

  cleanup(): void {
    if (this.listener) {
      window.removeEventListener("message", this.listener);
      this.listener = null;
    }
    try { window.removeHelcimPayIframe?.(); } catch { /* ignore */ }
  }
}

export const helcimClient = new HelcimPaymentClient();
