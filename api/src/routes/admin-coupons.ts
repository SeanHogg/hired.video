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
import { CreateCouponSchema, UpdateCouponSchema } from "../../../shared/coupons.js";
import { UuidLikeSchema } from "../../../shared/validation.js";
import { buildCouponDeps } from "../services/coupons/couponDeps.js";
import { createCoupon, listCoupons, listRedemptions, updateCoupon } from "../services/coupons/couponUseCases.js";
import { validateJson } from "./helpers/validate.js";

export const adminCouponRoutes = new Hono<AppEnv>();

/** Malformed ids are a 404, not a Postgres uuid cast error. */
const isId = (id: string) => UuidLikeSchema.safeParse(id).success;

adminCouponRoutes.get("/", async (c) => c.json(success({ coupons: await listCoupons(buildCouponDeps()) })));

adminCouponRoutes.post("/", validateJson(CreateCouponSchema, (e) => error("VALIDATION_ERROR", e.issues[0]?.message ?? "Invalid coupon"), { emptyBody: null }), async (c) => {
  const body = c.req.valid("json");
  return c.json(success(await createCoupon(buildCouponDeps(), { ...body, actorId: c.var.userId })), 201);
});

adminCouponRoutes.patch("/:id", validateJson(UpdateCouponSchema, (e) => error("VALIDATION_ERROR", e.issues[0]?.message ?? "Invalid update"), { emptyBody: null }), async (c) => {
  if (!isId(c.req.param("id"))) return c.json(error("NOT_FOUND", "Coupon not found"), 404);
  const body = c.req.valid("json");
  const coupon = await updateCoupon(buildCouponDeps(), { id: c.req.param("id"), actorId: c.var.userId, patch: body });
  return c.json(success(coupon));
});

adminCouponRoutes.get("/:id/redemptions", async (c) => {
  if (!isId(c.req.param("id"))) return c.json(error("NOT_FOUND", "Coupon not found"), 404);
  return c.json(success({ redemptions: await listRedemptions(buildCouponDeps(), c.req.param("id")) }));
});
