/**
 * Coupon client — /api/coupons (redeem) and /api/admin/coupons (SuperAdmin).
 * Contract: shared/coupons.ts.
 */
import { apiClient } from "@/lib/api-client";
import { apiServerErrorCode } from "@/lib/api-error-code";
import {
  isCouponErrorKind,
  type CouponDTO,
  type CouponRedemptionDTO,
  type CreateCouponInput,
  type RedeemCouponResultDTO,
  type UpdateCouponInput,
} from "@shared/coupons";


/** The shareable link that opens Settings → Billing with `code` prefilled
 *  (RedeemCouponCard reads `?coupon=`). */
export function couponRedeemUrl(code: string): string {
  return `${window.location.origin}/settings?tab=billing&coupon=${encodeURIComponent(code)}`;
}

/** i18n key for a failed redemption: the refusal kind's copy, the rate-limit
 *  copy, or a generic message for anything else (network, 5xx). */
export function couponRedeemErrorKey(err: unknown): string {
  const code = apiServerErrorCode(err);
  if (isCouponErrorKind(code)) return `billing.redeem.error.${code}`;
  if (code === "TOO_MANY_REQUESTS") return "billing.redeem.error.rateLimited";
  return "billing.redeem.error.generic";
}

export const couponService = {
  async redeem(code: string): Promise<RedeemCouponResultDTO> {
    // Refusals render inline on the card — no global error toast.
    const res = await apiClient.request<RedeemCouponResultDTO>("/api/coupons/redeem", {
      method: "POST",
      body: { code },
      suppressErrorEvent: true,
    });
    return res.data;
  },
  async adminList(): Promise<CouponDTO[]> {
    const res = await apiClient.get<{ coupons: CouponDTO[] }>("/api/admin/coupons");
    return res.data.coupons;
  },
  async adminCreate(input: Partial<CreateCouponInput>): Promise<CouponDTO> {
    const res = await apiClient.post<CouponDTO>("/api/admin/coupons", input);
    return res.data;
  },
  async adminUpdate(id: string, patch: UpdateCouponInput): Promise<CouponDTO> {
    const res = await apiClient.patch<CouponDTO>(`/api/admin/coupons/${id}`, patch);
    return res.data;
  },
  async adminRedemptions(id: string): Promise<CouponRedemptionDTO[]> {
    const res = await apiClient.get<{ redemptions: CouponRedemptionDTO[] }>(`/api/admin/coupons/${id}/redemptions`);
    return res.data.redemptions;
  },
};
