/**
 * Checkout client — the ONE caller of /api/checkout (start → pay → confirm
 * for boosts, paid courses and token packs). Contract: shared/checkout.ts.
 * Failures render inline at each surface, so no global error toast here.
 */
import { apiClient } from "@/lib/api-client";
import type { InitCollectionResult } from "@/lib/payment";
import type {
  CheckoutConfirmDTO,
  CheckoutDTO,
  CheckoutKind,
  CheckoutPayDTO,
  CheckoutReceiptDTO,
  StartCheckoutRequestOf,
} from "@shared/checkout";

const path = (checkoutId: string, suffix = "") => `/api/checkout/${encodeURIComponent(checkoutId)}${suffix}`;

export const checkoutService = {
  /** Server-priced start; the client never sends an amount. */
  async start<K extends CheckoutKind>(input: StartCheckoutRequestOf<K>): Promise<CheckoutDTO<K>> {
    const res = await apiClient.request<CheckoutDTO<K>>("/api/checkout", {
      method: "POST",
      body: input,
      suppressErrorEvent: true,
    });
    return res.data;
  },

  async get<K extends CheckoutKind = CheckoutKind>(checkoutId: string): Promise<CheckoutDTO<K>> {
    const res = await apiClient.request<CheckoutDTO<K>>(path(checkoutId), { suppressErrorEvent: true });
    return res.data;
  },

  /** Opens the payment widget for exactly the amount due. */
  async pay(checkoutId: string, returnUrl: string = window.location.href): Promise<CheckoutPayDTO<InitCollectionResult>> {
    const res = await apiClient.request<CheckoutPayDTO<InitCollectionResult>>(path(checkoutId, "/pay"), {
      method: "POST",
      body: { successUrl: returnUrl, cancelUrl: returnUrl },
      suppressErrorEvent: true,
    });
    return res.data;
  },

  /** The server re-reads the transaction from the provider before fulfilling. */
  async confirm<K extends CheckoutKind = CheckoutKind>(checkoutId: string, transactionId: string): Promise<CheckoutConfirmDTO<K>> {
    const res = await apiClient.request<CheckoutConfirmDTO<K>>(path(checkoutId, "/confirm"), {
      method: "POST",
      body: { transactionId },
      suppressErrorEvent: true,
    });
    return res.data;
  },

  /** Completed purchases (receipts), optionally for one kind. */
  async listMine(kind?: CheckoutKind): Promise<CheckoutReceiptDTO[]> {
    const qs = kind ? `?kind=${encodeURIComponent(kind)}` : "";
    const res = await apiClient.get<CheckoutReceiptDTO[]>(`/api/checkout/mine${qs}`);
    return res.data ?? [];
  },
};
