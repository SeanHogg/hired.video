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
import { couponErrorResponse } from "./coupon-errors.js";

export const couponRoutes = new Hono<AppEnv>();

// Per-user cap: stops code guessing without bothering a real person who
// mistypes a few times.
const redeemLimiter = createIpRateLimiter({
  windowMs: 15 * 60 * 1000,
  maxAttempts: 10,
  message: "Too many code attempts. Please try again in a few minutes.",
  keyOf: (c) => `coupon:${(c.get("user") as { sub?: string } | undefined)?.sub ?? getClientIp(c)}`,
});

couponRoutes.post("/redeem", redeemLimiter, async (c) => {
  const parsed = RedeemCouponSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json(error("INVALID_CODE", "That code isn't valid"), 400);
  try {
    const result = await redeemCoupon(buildCouponDeps(), { userId: c.var.user.sub, isGuest: Boolean(c.var.user.guest), code: parsed.data.code });
    return c.json(success(result));
  } catch (err) {
    return couponErrorResponse(c, err);
  }
});
