import type { Context } from "hono";
import { error } from "../types/index.js";
import type { CouponErrorKind } from "../../../shared/coupons.js";
import { CouponError } from "../services/coupons/couponUseCases.js";

/** CouponError → HTTP status, shared by the user and SuperAdmin routes. */
const STATUS: Record<CouponErrorKind, 403 | 404 | 409 | 410> = {
  INVALID_CODE: 404,
  NOT_FOUND: 404,
  EXPIRED: 410,
  EXHAUSTED: 410,
  ALREADY_REDEEMED: 409,
  ALREADY_PRO: 409,
  ACCOUNT_REQUIRED: 403,
  CODE_TAKEN: 409,
};

export function couponErrorResponse(c: Context, err: unknown): Response {
  if (err instanceof CouponError) return c.json(error(err.kind, err.message), STATUS[err.kind]);
  throw err;
}
