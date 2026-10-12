/**
 * Token-pack client — /api/token-packs (start a server-priced checkout,
 * confirm a paid transaction). Contract: shared/token-packs.ts.
 */
import { apiClient } from "@/lib/api-client";
import { apiServerErrorCode } from "@/lib/api-error-code";
import type { InitCollectionResult } from "@/lib/payment";
import { tokenPackErrorKey, type ConfirmTokenPackResultDTO } from "@shared/token-packs";

/** i18n key for a failed purchase step (typed refusal, else generic). */
export function tokenPackPurchaseErrorKey(err: unknown): string {
  return tokenPackErrorKey(apiServerErrorCode(err));
}

export const tokenPackService = {
  /** Opens the payment widget for exactly this pack's server-side price. */
  async startCheckout(packId: string): Promise<InitCollectionResult> {
    const returnUrl = `${window.location.origin}/settings?tab=billing`;
    // Failures render inline in the buy sheet — no global error toast.
    const res = await apiClient.request<{ collection: InitCollectionResult }>(
      `/api/token-packs/${encodeURIComponent(packId)}/checkout`,
      { method: "POST", body: { successUrl: returnUrl, cancelUrl: returnUrl }, suppressErrorEvent: true },
    );
    return res.data.collection;
  },

  async confirm(packId: string, transactionId: string): Promise<ConfirmTokenPackResultDTO> {
    const res = await apiClient.request<ConfirmTokenPackResultDTO>("/api/token-packs/confirm", {
      method: "POST",
      body: { packId, transactionId },
      suppressErrorEvent: true,
    });
    return res.data;
  },
};
