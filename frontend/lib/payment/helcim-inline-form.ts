/**
 * Helcim.js v2 inline-form helper.
 *
 * Mounts a self-contained modal overlay containing the card-collection
 * inputs Helcim.js v2 requires by *id*. On submit it calls
 * `window.helcimProcess()`, which makes a CORS AJAX call to Helcim, then
 * writes the response back into matching DOM inputs (cardToken / transactionId
 * / responseMessage / etc.). We poll those inputs for completion and resolve
 * the wrapping promise.
 *
 * Why an overlay and not page-embedded inputs? The existing iFrame modal
 * client also mounts on top of the page, so both flows share the same UX
 * shape — the buyer clicks "Complete Purchase", a modal opens, they enter
 * card details, they're done. The Checkout page therefore needs no special
 * casing per flow.
 *
 * Helcim.js docs: https://devdocs.helcim.com/docs/helcim-js-v2
 */

import type { PaymentClientCallbacks, InitCollectionResult } from "./types";

declare global {
  interface Window {
    helcimProcess?: () => boolean;
  }
}

/** Inputs Helcim.js v2 reads from the page on submit. */
interface HelcimInlineConfig {
  token: string;
  amount?: number;
  currency: string;
  /** Helcim test mode — "1" to route to Helcim's sandbox API. */
  test: boolean;
}

/** Subset of response fields Helcim.js writes back into hidden inputs. */
interface HelcimInlineResponse {
  response: string;           // "1" approved, "0" declined
  responseMessage?: string;
  transactionId?: string;
  cardToken?: string;
  cardF4L4?: string;          // first4/last4, e.g. "5454...5454"
  cardType?: string;          // visa, mastercard, …
  cardExpiryDate?: string;    // MMYY
}

const ROOT_ID = "helcim-inline-modal-root";
const RESPONSE_POLL_MS = 250;
const RESPONSE_TIMEOUT_MS = 60_000;

/**
 * Build the modal DOM. Inputs are real `<input>` elements (not React) so
 * Helcim.js v2 can find them by `id` and read/write `.value` directly.
 */
function buildInlineModal(): HTMLDivElement {
  const root = document.createElement("div");
  root.id = ROOT_ID;
  root.setAttribute(
    "style",
    [
      "position:fixed",
      "inset:0",
      "background:rgba(0,0,0,0.55)",
      "z-index:9999",
      "display:flex",
      "align-items:center",
      "justify-content:center",
      "font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif",
    ].join(";"),
  );

  const labelStyle =
    "display:block;font-size:12px;font-weight:500;margin:8px 0 4px;color:#374151";
  const inputStyle =
    "width:100%;padding:8px 10px;border:1px solid #d1d5db;border-radius:6px;font-size:14px";

  root.innerHTML = `
    <form id="helcimForm" autocomplete="off"
      style="background:#fff;border-radius:12px;padding:24px;width:100%;max-width:420px;box-shadow:0 20px 50px rgba(0,0,0,0.25)">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
        <h2 style="font-size:18px;font-weight:600;margin:0;color:#111827">Enter card details</h2>
        <button type="button" id="helcim-inline-close"
          aria-label="Close"
          style="background:transparent;border:0;font-size:22px;line-height:1;cursor:pointer;color:#6b7280">×</button>
      </div>
      <p style="font-size:13px;color:#6b7280;margin:0 0 16px">
        Your card is tokenised by Helcim — these details never touch our servers.
      </p>

      <label for="cardHolderName" style="${labelStyle}">Name on card</label>
      <input id="cardHolderName" type="text" autocomplete="cc-name" style="${inputStyle}" />

      <label for="cardNumber" style="${labelStyle}">Card number</label>
      <input id="cardNumber" type="text" autocomplete="cc-number" inputmode="numeric" style="${inputStyle}" />

      <div style="display:flex;gap:12px">
        <div style="flex:1">
          <label for="cardExpiry" style="${labelStyle}">Expiry (MMYY)</label>
          <input id="cardExpiry" type="text" autocomplete="cc-exp" inputmode="numeric" maxlength="4" style="${inputStyle}" />
        </div>
        <div style="flex:1">
          <label for="cardCVV" style="${labelStyle}">CVV</label>
          <input id="cardCVV" type="text" autocomplete="cc-csc" inputmode="numeric" maxlength="4" style="${inputStyle}" />
        </div>
      </div>

      <label for="cardHolderAddress" style="${labelStyle}">Billing address</label>
      <input id="cardHolderAddress" type="text" autocomplete="street-address" style="${inputStyle}" />

      <label for="cardHolderPostalCode" style="${labelStyle}">Postal / ZIP code</label>
      <input id="cardHolderPostalCode" type="text" autocomplete="postal-code" style="${inputStyle}" />

      <!-- Helcim.js config inputs (hidden) -->
      <input type="hidden" id="token" />
      <input type="hidden" id="dontSubmit" value="1" />
      <input type="hidden" id="language" value="en" />
      <input type="hidden" id="amount" />
      <input type="hidden" id="currency" />
      <input type="hidden" id="test" />
      <input type="hidden" id="paymentMethod" value="cc" />

      <!-- Helcim.js writes the response back into these -->
      <input type="hidden" id="response" />
      <input type="hidden" id="responseMessage" />
      <input type="hidden" id="transactionId" />
      <input type="hidden" id="cardToken" />
      <input type="hidden" id="cardF4L4" />
      <input type="hidden" id="cardType" />
      <input type="hidden" id="cardExpiryDate" />

      <div id="helcim-inline-error"
        style="color:#dc2626;font-size:13px;min-height:18px;margin-top:8px"></div>

      <button type="submit" id="helcim-inline-pay"
        style="margin-top:16px;width:100%;padding:10px 14px;border:0;border-radius:8px;font-size:14px;font-weight:600;color:#fff;background:linear-gradient(90deg,#2563eb,#2563eb);cursor:pointer">
        Pay
      </button>
    </form>
  `;

  document.body.appendChild(root);
  return root;
}

function setValue(id: string, value: string): void {
  const el = document.getElementById(id) as HTMLInputElement | null;
  if (el) el.value = value;
}

function getValue(id: string): string {
  const el = document.getElementById(id) as HTMLInputElement | null;
  return el ? el.value : "";
}

/**
 * Wait until Helcim.js writes the `response` hidden input. Resolves with the
 * full response snapshot; rejects on timeout.
 */
function waitForResponse(signal: AbortSignal): Promise<HelcimInlineResponse> {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const interval = window.setInterval(() => {
      if (signal.aborted) {
        window.clearInterval(interval);
        reject(new Error("aborted"));
        return;
      }
      const response = getValue("response");
      if (response === "1" || response === "0") {
        window.clearInterval(interval);
        resolve({
          response,
          responseMessage: getValue("responseMessage") || undefined,
          transactionId: getValue("transactionId") || undefined,
          cardToken: getValue("cardToken") || undefined,
          cardF4L4: getValue("cardF4L4") || undefined,
          cardType: getValue("cardType") || undefined,
          cardExpiryDate: getValue("cardExpiryDate") || undefined,
        });
        return;
      }
      if (Date.now() - started > RESPONSE_TIMEOUT_MS) {
        window.clearInterval(interval);
        reject(new Error("Helcim did not respond in time"));
      }
    }, RESPONSE_POLL_MS);
  });
}

/** Extract last4 from a Helcim "F4L4" string like "5454...5454" or "5454". */
function extractLast4(f4l4: string | undefined): string | undefined {
  if (!f4l4) return undefined;
  const digits = f4l4.replace(/\D/g, "");
  return digits.length >= 4 ? digits.slice(-4) : undefined;
}

/**
 * Mount the inline form, wait for the buyer to submit, and resolve with the
 * normalised PaymentSuccessData (via callbacks). Returns a cleanup function
 * that tears down the modal + listeners.
 */
export function openHelcimInlineForm(
  result: InitCollectionResult,
  callbacks: PaymentClientCallbacks,
  opts: { test?: boolean } = {},
): () => void {
  const cfg = result.helcimJsConfig;
  if (!cfg) {
    callbacks.onError("Helcim inline flow missing helcimJsConfig");
    return () => {};
  }

  const config: HelcimInlineConfig = {
    token: cfg.token,
    amount: result.amount,
    currency: result.currency ?? "USD",
    test: opts.test ?? false,
  };

  const root = buildInlineModal();
  const abort = new AbortController();

  // Pre-fill hidden config inputs.
  setValue("token", config.token);
  setValue("currency", config.currency);
  setValue("test", config.test ? "1" : "0");
  // amount empty for card-on-file (Helcim treats missing amount as verify)
  setValue("amount", config.amount && config.amount > 0 ? config.amount.toFixed(2) : "");

  const errorEl = root.querySelector<HTMLDivElement>("#helcim-inline-error");
  const form = root.querySelector<HTMLFormElement>("#helcimForm")!;
  const closeBtn = root.querySelector<HTMLButtonElement>("#helcim-inline-close")!;

  const cleanup = (): void => {
    abort.abort();
    try { root.remove(); } catch { /* already removed */ }
  };

  const cancel = (): void => {
    cleanup();
    callbacks.onError("Payment was cancelled");
  };

  closeBtn.addEventListener("click", cancel);
  // Click outside the form (on the backdrop) also cancels.
  root.addEventListener("click", (e) => {
    if (e.target === root) cancel();
  });

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    if (errorEl) errorEl.textContent = "";

    if (typeof window.helcimProcess !== "function") {
      const msg = "Helcim.js failed to load";
      if (errorEl) errorEl.textContent = msg;
      return;
    }

    // helcimProcess() reads the inputs by id, validates them, and on success
    // makes an async XHR. With dontSubmit=1, it returns false so the form
    // never POSTs anywhere — we read the response asynchronously.
    let started = false;
    try {
      started = window.helcimProcess() !== false;
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Helcim.js threw on submit";
      if (errorEl) errorEl.textContent = msg;
      return;
    }
    // Validation failures show via helcim.js's own UI / responseMessage; we
    // still wait for `response` to populate either way so a 0 surfaces too.
    void started;

    waitForResponse(abort.signal)
      .then((response) => {
        if (response.response === "1") {
          cleanup();
          callbacks.onSuccess({
            paymentMethodToken: response.cardToken ?? "",
            transactionId: response.transactionId,
            maskedCard: response.cardF4L4,
            last4: extractLast4(response.cardF4L4),
            cardBrand: response.cardType,
            amount: config.amount?.toFixed(2),
            raw: response,
          });
        } else {
          // Declined — keep modal open so the buyer can fix and retry.
          if (errorEl) {
            errorEl.textContent =
              response.responseMessage ?? "Card was declined. Please check the details and try again.";
          }
          // Reset response inputs so the next attempt's poll can fire again.
          setValue("response", "");
          setValue("responseMessage", "");
        }
      })
      .catch((err) => {
        if (abort.signal.aborted) return; // cleanup() already fired
        const msg = err instanceof Error ? err.message : "Helcim response failed";
        if (errorEl) errorEl.textContent = msg;
      });
  });

  return cleanup;
}
