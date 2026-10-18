/**
 * /api/coupons — user side of SuperAdmin coupon codes (migration 0500).
 *
 *   POST /redeem  { code }  — redeem a code for a time-boxed Pro comp
 *
 * Thin layer: validate → use case → map CouponError to HTTP.
 */
import { Hono } from "hono";
import type { AppEnv } from "../types/index.js";
import { success, error } from "../types/index.js";
import { RedeemCouponSchema } from "../../../shared/coupons.js";
import { createIpRateLimiter, getClientIp } from "../middleware/rateLimiter.js";
import { buildCouponDeps } from "../services/coupons/couponDeps.js";
import { redeemCoupon } from "../services/coupons/couponUseCases.js";
import { validateJson } from "./helpers/validate.js";

export const couponRoutes = new Hono<AppEnv>();

// Per-user cap: stops code guessing without bothering a real person who
// mistypes a few times.
const redeemLimiter = createIpRateLimiter({
  windowMs: 15 * 60 * 1000,
  maxAttempts: 10,
  message: "Too many code attempts. Please try again in a few minutes.",
  keyOf: (c) => `coupon:${(c.get("user") as { sub?: string } | undefined)?.sub ?? getClientIp(c)}`,
});

couponRoutes.post("/redeem", redeemLimiter, validateJson(RedeemCouponSchema, () => error("INVALID_CODE", "That code isn't valid"), { emptyBody: null }), async (c) => {
  const body = c.req.valid("json");
  const result = await redeemCoupon(buildCouponDeps(), { userId: c.var.userId, isGuest: Boolean(c.var.user.guest), code: body.code });
  return c.json(success(result));
});
