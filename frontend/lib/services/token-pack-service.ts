/**
 * Token-pack client — confirm a paid pack through the one checkout surface
 * (POST /api/checkout/token_pack:<packId>/confirm). Paying runs through
 * useCheckoutPayment; contract: shared/checkout.ts + shared/token-packs.ts.
 */
import { apiServerErrorCode } from "@/lib/api-error-code";
import { checkoutService } from "@/lib/services/checkout-service";
import { checkoutIdFor } from "@shared/checkout";
import { tokenPackErrorKey, type ConfirmTokenPackResultDTO } from "@shared/token-packs";

/** i18n key for a failed purchase step (typed refusal, else generic). */
export function tokenPackPurchaseErrorKey(err: unknown): string {
  return tokenPackErrorKey(apiServerErrorCode(err));
}

/** The checkout id of a pack (the pack id is its key). */
export function tokenPackCheckoutId(packId: string): string {
  return checkoutIdFor("token_pack", packId);
}

export const tokenPackService = {
  async confirm(packId: string, transactionId: string): Promise<ConfirmTokenPackResultDTO> {
    const r = await checkoutService.confirm<"token_pack">(tokenPackCheckoutId(packId), transactionId);
    return { pending: r.pending, ...r.outcome };
  },
};
