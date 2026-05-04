/**
 * useHelcimPay — React hook for Helcim payment collection.
 *
 * Supports TWO flows, selectable at call-time:
 *
 *   1. **HelcimPay.js** (modal) — loads HelcimPay.js SDK, calls
 *      appendHelcimPayIframe(checkoutToken) to open a Helcim-hosted overlay.
 *      Listens for window.postMessage events for SUCCESS / ABORTED.
 *
 *   2. **Helcim.js** (inline form) — loads Helcim.js v2, renders standard
 *      HTML form fields (cardNumber, cardExpiryMonth, etc.) with the right
 *      `id` attributes.  On submit calls helcimProcess() which tokenises
 *      the card via CORS AJAX and posts results back to the form.
 *
 * Both flows are PCI-safe — raw card numbers never hit our servers.
 */

import { useCallback, useRef, useState } from "react";
import { billingService } from "@/lib/services/billing-service";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type HelcimFlowType = "helcimpay" | "helcimjs";

export interface HelcimPayOptions {
  /** Which flow to use. Default: "helcimpay" (modal). */
  flow?: HelcimFlowType;
  /** Cart total in dollars (e.g. 9.95). 0 for card-on-file / verify. */
  amount?: number;
  currency?: string;
  successUrl?: string;
  cancelUrl?: string;
  /** Called on successful payment. */
  onSuccess?: (data: HelcimSuccessData) => void;
  /** Called when the user cancels or an error occurs. */
  onError?: (error: string) => void;
}

export interface HelcimSuccessData {
  cardToken: string;
  transactionId?: string;
  cardNumber?: string;   // masked, e.g. "5454****5454"
  cardType?: string;     // "Visa", "Mastercard"
  cardExpiry?: string;
  amount?: string;
  approvalCode?: string;
  customerCode?: string;
}

// Helcim global functions injected by their scripts
declare global {
  interface Window {
    // HelcimPay.js
    appendHelcimPayIframe?: (checkoutToken: string) => void;
    removeHelcimPayIframe?: () => void;
    // Helcim.js
    helcimProcess?: () => void;
  }
}

// ---------------------------------------------------------------------------
// Script loader utility
// ---------------------------------------------------------------------------

const loadedScripts = new Set<string>();

function loadScript(src: string): Promise<void> {
  if (loadedScripts.has(src)) return Promise.resolve();
  return new Promise((resolve, reject) => {
    // Check if already in DOM
    if (document.querySelector(`script[src="${src}"]`)) {
      loadedScripts.add(src);
      resolve();
      return;
    }
    const script = document.createElement("script");
    script.src = src;
    script.async = true;
    script.onload = () => {
      loadedScripts.add(src);
      resolve();
    };
    script.onerror = () => reject(new Error(`Failed to load script: ${src}`));
    document.head.appendChild(script);
  });
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useHelcimPay() {
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const messageListenerRef = useRef<((e: MessageEvent) => void) | null>(null);

  /**
   * Clean up HelcimPay.js modal and event listener.
   */
  const cleanup = useCallback(() => {
    if (messageListenerRef.current) {
      window.removeEventListener("message", messageListenerRef.current);
      messageListenerRef.current = null;
    }
    try {
      window.removeHelcimPayIframe?.();
    } catch { /* ignore */ }
  }, []);

  /**
   * Initiate payment collection.  Call this from the "Pay" or "Add payment
   * method" button handler.
   */
  const startPayment = useCallback(async (options: HelcimPayOptions = {}) => {
    const {
      flow = "helcimpay",
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
      // 1. Get checkout token + config from our API
      const result = await billingService.initPaymentCollection(
        successUrl,
        cancelUrl,
        amount,
        currency,
      );

      if (result.flowType === "redirect" && result.redirectUrl) {
        window.location.href = result.redirectUrl;
        return;
      }

      // ---------------------------------------------------------------
      // Flow A: HelcimPay.js modal
      // ---------------------------------------------------------------
      if (flow === "helcimpay" && result.checkoutToken && result.sdkScriptUrl) {
        await loadScript(result.sdkScriptUrl);

        if (!window.appendHelcimPayIframe) {
          throw new Error("HelcimPay.js SDK failed to load — appendHelcimPayIframe not found");
        }

        // Listen for postMessage from Helcim iFrame
        const messageHandler = (event: MessageEvent) => {
          const data = event.data;
          if (!data || typeof data !== "object") return;

          // HelcimPay.js sends events with an eventName field
          if (data.eventName === "helcim-pay-success" || data.eventStatus === "APPROVED") {
            cleanup();
            setIsProcessing(false);
            const successData: HelcimSuccessData = {
              cardToken: data.cardToken ?? data.data?.cardToken ?? "",
              transactionId: data.transactionId ?? data.data?.transactionId,
              cardNumber: data.cardNumber ?? data.data?.cardNumber,
              cardType: data.cardType ?? data.data?.cardType,
              cardExpiry: data.cardExpiry ?? data.data?.cardExpiry,
              amount: data.amount ?? data.data?.amount,
              approvalCode: data.approvalCode ?? data.data?.approvalCode,
              customerCode: data.customerCode ?? data.data?.customerCode,
            };
            onSuccess?.(successData);
          } else if (
            data.eventName === "helcim-pay-error" ||
            data.eventName === "helcim-pay-abort" ||
            data.eventStatus === "ABORTED"
          ) {
            cleanup();
            setIsProcessing(false);
            const msg = data.message ?? "Payment was cancelled";
            setError(msg);
            onError?.(msg);
          }
        };

        messageListenerRef.current = messageHandler;
        window.addEventListener("message", messageHandler);

        // Open the Helcim modal
        window.appendHelcimPayIframe(result.checkoutToken);
        return;
      }

      // ---------------------------------------------------------------
      // Flow B: Helcim.js inline form
      // ---------------------------------------------------------------
      if (flow === "helcimjs" && result.helcimJsConfig) {
        await loadScript(result.helcimJsConfig.scriptUrl);

        // Set the hidden token field
        const tokenInput = document.getElementById("token") as HTMLInputElement | null;
        if (tokenInput) {
          tokenInput.value = result.helcimJsConfig.token;
        }

        // Set the amount field if provided
        if (amount !== undefined) {
          const amountInput = document.getElementById("amount") as HTMLInputElement | null;
          if (amountInput) {
            amountInput.value = amount.toFixed(2);
          }
        }

        // Helcim.js will be triggered by the form's helcimProcess() call.
        // The form submit handler (in the Checkout component) will call
        // window.helcimProcess() which sends the card data to Helcim via
        // CORS AJAX.  After processing, Helcim.js populates the
        // #helcimResults div with hidden inputs and submits the form.
        //
        // We set isProcessing false here since the form handles the
        // actual submit flow separately.
        setIsProcessing(false);
        return;
      }

      // ---------------------------------------------------------------
      // Fallback: no compatible flow found
      // ---------------------------------------------------------------
      throw new Error("No compatible payment flow available");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Payment initialisation failed";
      setError(msg);
      onError?.(msg);
      setIsProcessing(false);
    }
  }, [cleanup]);

  return {
    startPayment,
    isProcessing,
    error,
    cleanup,
  };
}
