/**
 * Helcim payment client — dispatches between two collection flows:
 *
 *   - "modal"  → HelcimPay.js iFrame overlay (server pre-mints a checkoutToken).
 *   - "inline" → Helcim.js v2 inline form (page renders its own card inputs).
 *
 * The backend's `result.collectionFlow` picks the path. Both flows resolve
 * through the same `PaymentClientCallbacks` contract so callers (Checkout,
 * Settings → Payment Methods) don't branch on flow.
 */

import type {
  PaymentClient,
  PaymentClientCallbacks,
  InitCollectionResult,
} from "./types";
import { loadScript } from "./script-loader";
import { openHelcimInlineForm } from "./helcim-inline-form";

declare global {
  interface Window {
    appendHelcimPayIframe?: (checkoutToken: string) => void;
    removeHelcimPayIframe?: () => void;
  }
}

/**
 * Pull the last four digits from a Helcim-style masked card string. Helcim's
 * postMessage typically returns shapes like "5454****5454", "**** **** **** 5454",
 * or just "5454"; we want the trailing digits. Returns undefined for
 * unrecognised inputs so the saved payment method just shows no last4.
 */
function extractLast4(masked: string | undefined): string | undefined {
  if (!masked) return undefined;
  const digits = masked.replace(/\D/g, "");
  return digits.length >= 4 ? digits.slice(-4) : undefined;
}

class HelcimPaymentClient implements PaymentClient {
  readonly name = "helcim";
  private messageListener: ((e: MessageEvent) => void) | null = null;
  private inlineCleanup: (() => void) | null = null;

  async start(result: InitCollectionResult, callbacks: PaymentClientCallbacks): Promise<void> {
    if (result.collectionFlow === "inline") {
      return this.startInline(result, callbacks);
    }
    return this.startModal(result, callbacks);
  }

  private async startInline(result: InitCollectionResult, callbacks: PaymentClientCallbacks): Promise<void> {
    if (!result.helcimJsConfig) {
      callbacks.onError("Helcim inline flow missing helcimJsConfig");
      return;
    }
    await loadScript(result.helcimJsConfig.scriptUrl);
    if (typeof window.helcimProcess !== "function") {
      callbacks.onError("Helcim.js failed to load");
      return;
    }
    // Wrap the supplied callbacks so this client owns the cleanup handle
    // (so `cleanup()` from PaymentClient still works for the inline flow).
    this.inlineCleanup = openHelcimInlineForm(result, {
      onSuccess: (data) => {
        this.inlineCleanup = null;
        callbacks.onSuccess(data);
      },
      onError: (msg) => {
        this.inlineCleanup = null;
        callbacks.onError(msg);
      },
    });
  }

  private async startModal(result: InitCollectionResult, callbacks: PaymentClientCallbacks): Promise<void> {
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
        const masked = data.cardNumber ?? data.data?.cardNumber;
        callbacks.onSuccess({
          paymentMethodToken: data.cardToken ?? data.data?.cardToken ?? "",
          transactionId: data.transactionId ?? data.data?.transactionId,
          maskedCard: masked,
          last4: extractLast4(masked),
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

    this.messageListener = handler;
    window.addEventListener("message", handler);
    window.appendHelcimPayIframe(result.checkoutToken);
  }

  cleanup(): void {
    if (this.messageListener) {
      window.removeEventListener("message", this.messageListener);
      this.messageListener = null;
    }
    try { window.removeHelcimPayIframe?.(); } catch { /* ignore */ }
    if (this.inlineCleanup) {
      try { this.inlineCleanup(); } catch { /* ignore */ }
      this.inlineCleanup = null;
    }
  }
}

export const helcimClient = new HelcimPaymentClient();
