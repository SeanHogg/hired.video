/**
 * Coupon codes — SuperAdmin-issued codes that grant a time-boxed Pro comp
 * (migration 0500). Redeeming one gives the user Pro for `durationDays`:
 * résumé creation + tailoring, AI cover letters, video résumé publishing,
 * promotion to social, and the Pro token budget — every Pro gate already
 * resolves through `user_plan_overrides`, which is what a redemption writes.
 *
 * Shared by the API (validation) and the frontend (forms + error copy).
 */
import { z } from "zod";

/** The plan a coupon grants. One value today; widen here (and the
 *  redemption use case) if a coupon ever grants another tier. */
export const COUPON_GRANT_PLAN = "pro" as const;

/** "A free month" — the default grant length. */
export const COUPON_DEFAULT_DURATION_DAYS = 30;
export const COUPON_MAX_DURATION_DAYS = 365;

/** The plan facts eligibility depends on (a SubscriptionSummaryDTO subset). */
export interface CouponEligibilityInput {
  isPro: boolean;
  planId: string;
  subscribed: boolean;
  compedUntil: string | null | undefined;
}

/**
 * Whether a coupon would grant this user anything. Free users can redeem,
 * and a time-boxed Pro comp can be extended; a paid plan, trial, staff role,
 * permanent comp or higher-tier comp cannot. The API enforces it; the UI
 * uses it to decide whether to offer the redeem field at all.
 */
export function canRedeemCoupon(p: CouponEligibilityInput): boolean {
  if (p.subscribed) return false;
  if (!p.isPro) return true;
  return Boolean(p.compedUntil) && p.planId === COUPON_GRANT_PLAN;
}

export const COUPON_CODE_MIN = 4;
export const COUPON_CODE_MAX = 32;
const CODE_PATTERN = /^[A-Z0-9-]+$/;

/** Codes are case-insensitive: stored and matched upper-case, trimmed. */
export function normalizeCouponCode(raw: string): string {
  return raw.trim().toUpperCase();
}

export function isValidCouponCode(code: string): boolean {
  return code.length >= COUPON_CODE_MIN && code.length <= COUPON_CODE_MAX && CODE_PATTERN.test(code);
}

const CouponCodeSchema = z
  .string()
  .transform(normalizeCouponCode)
  .refine(isValidCouponCode, {
    message: `Code must be ${COUPON_CODE_MIN}-${COUPON_CODE_MAX} letters, digits or dashes`,
  });

export const CreateCouponSchema = z.object({
  /** Omitted → the server generates one. */
  code: CouponCodeSchema.optional(),
  durationDays: z.number().int().min(1).max(COUPON_MAX_DURATION_DAYS).default(COUPON_DEFAULT_DURATION_DAYS),
  /** null → unlimited redemptions. */
  maxRedemptions: z.number().int().min(1).max(1_000_000).nullable().default(null),
  /** Last moment the code can be redeemed (ISO). null → never expires. */
  expiresAt: z.string().datetime({ offset: true }).nullable().default(null),
  note: z.string().trim().max(500).default(""),
});
export type CreateCouponInput = z.infer<typeof CreateCouponSchema>;

export const UpdateCouponSchema = z
  .object({
    isActive: z.boolean(),
    maxRedemptions: z.number().int().min(1).max(1_000_000).nullable(),
    expiresAt: z.string().datetime({ offset: true }).nullable(),
    note: z.string().trim().max(500),
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, { message: "Nothing to update" });
export type UpdateCouponInput = z.infer<typeof UpdateCouponSchema>;

export const RedeemCouponSchema = z.object({ code: CouponCodeSchema });

/** Why a redemption was refused. Each kind has user-facing copy under
 *  `billing.redeem.error.<kind>` in the locale catalogs. */
export const COUPON_ERROR_KINDS = [
  "INVALID_CODE",
  "EXPIRED",
  "EXHAUSTED",
  "ALREADY_REDEEMED",
  "ALREADY_PRO",
  "ACCOUNT_REQUIRED",
  "CODE_TAKEN",
  "NOT_FOUND",
] as const;
export type CouponErrorKind = (typeof COUPON_ERROR_KINDS)[number];

export function isCouponErrorKind(v: unknown): v is CouponErrorKind {
  return typeof v === "string" && (COUPON_ERROR_KINDS as readonly string[]).includes(v);
}

export interface CouponDTO {
  id: string;
  code: string;
  durationDays: number;
  maxRedemptions: number | null;
  redemptionCount: number;
  expiresAt: string | null;
  isActive: boolean;
  note: string;
  createdAt: string;
}

export interface CouponRedemptionDTO {
  id: string;
  userId: string;
  email: string | null;
  name: string | null;
  grantedUntil: string;
  redeemedAt: string;
}

export interface RedeemCouponResultDTO {
  code: string;
  durationDays: number;
  /** When the Pro comp now ends (stacked onto any active comp). */
  grantedUntil: string;
}
