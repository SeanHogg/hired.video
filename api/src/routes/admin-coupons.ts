/**
 * /api/admin/coupons — SuperAdmin coupon management (migration 0500).
 *
 *   GET   /                  — codes, newest first (bounded)
 *   POST  /                  — create (code optional → generated)
 *   PATCH /:id               — activate/deactivate, cap, expiry, note
 *   GET   /:id/redemptions   — who redeemed, newest first (bounded)
 *
 * Reads are uncached on purpose: SuperAdmin-only, low traffic, and the
 * operator needs live counts right after a write.
 */
import { Hono } from "hono";
import type { AppEnv } from "../types/index.js";
import { success, error } from "../types/index.js";
import { superAdminMiddleware } from "../middleware/superAdmin.js";
import { CreateCouponSchema, UpdateCouponSchema } from "../../../shared/coupons.js";
import { UuidLikeSchema } from "../../../shared/validation.js";
import { buildCouponDeps } from "../services/coupons/couponDeps.js";
import { createCoupon, listCoupons, listRedemptions, updateCoupon } from "../services/coupons/couponUseCases.js";
import { couponErrorResponse } from "./coupon-errors.js";

export const adminCouponRoutes = new Hono<AppEnv>();

adminCouponRoutes.use("*", superAdminMiddleware);

/** Malformed ids are a 404, not a Postgres uuid cast error. */
const isId = (id: string) => UuidLikeSchema.safeParse(id).success;

adminCouponRoutes.get("/", async (c) => c.json(success({ coupons: await listCoupons(buildCouponDeps()) })));

adminCouponRoutes.post("/", async (c) => {
  const parsed = CreateCouponSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    return c.json(error("VALIDATION_ERROR", parsed.error.issues[0]?.message ?? "Invalid coupon"), 400);
  }
  try {
    return c.json(success(await createCoupon(buildCouponDeps(), { ...parsed.data, actorId: c.var.user.sub })), 201);
  } catch (err) {
    return couponErrorResponse(c, err);
  }
});

adminCouponRoutes.patch("/:id", async (c) => {
  if (!isId(c.req.param("id"))) return c.json(error("NOT_FOUND", "Coupon not found"), 404);
  const parsed = UpdateCouponSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    return c.json(error("VALIDATION_ERROR", parsed.error.issues[0]?.message ?? "Invalid update"), 400);
  }
  try {
    const coupon = await updateCoupon(buildCouponDeps(), { id: c.req.param("id"), actorId: c.var.user.sub, patch: parsed.data });
    return c.json(success(coupon));
  } catch (err) {
    return couponErrorResponse(c, err);
  }
});

adminCouponRoutes.get("/:id/redemptions", async (c) => {
  if (!isId(c.req.param("id"))) return c.json(error("NOT_FOUND", "Coupon not found"), 404);
  return c.json(success({ redemptions: await listRedemptions(buildCouponDeps(), c.req.param("id")) }));
});
