/**
 * /api/boost-checkout — #177 paid boost checkout.
 *
 * Splits the requested boost spend between Campaign $ (gamification
 * redemption ledger) and USD. The flow is:
 *
 *   1. Caller hits POST /api/boost-checkout with a draft boost payload.
 *   2. We compute the total cost via computeBoostPricing()
 *      (services/advertising/pricing.ts — flat pricing today, #1764/D6).
 *   3. We debit as much Campaign $ as is available (capped at the total).
 *   4. The remainder is the USD owed. POST /:id/pay opens the one-off
 *      payment widget for exactly that amount; POST /:id/confirm-payment
 *      re-reads the transaction from the provider (shared verifier with
 *      token packs) and activates only an approved, exact, unused payment.
 *   5. The boost row is created with status='pending_payment' when USD
 *      is owed, or 'active' when Campaign $ covered everything.
 */

import { Hono } from "hono";
import { z } from "zod";
import type { AppEnv } from "../types/index.js";
import { success, error } from "../types/index.js";
import { UuidLikeSchema } from "../../../shared/validation.js";
import {
  confirmBoostPayment,
  startBoostCheckout,
  startBoostPayment,
  type BoostPaymentErrorCode,
} from "../services/advertising/boost-checkout.js";
import { oneOffPaymentsFromEnv } from "../services/billing/payment/oneOffPayments.js";
import { createIpRateLimiter, getClientIp } from "../middleware/rateLimiter.js";

export const boostCheckoutRoutes = new Hono<AppEnv>();

function uid(c: any): string | null {
  return (c.var.user?.sub as string | undefined) ?? null;
}

const CheckoutSchema = z.object({
  subjectType: z.string().min(1).max(32),
  subjectId: UuidLikeSchema,
  budgetCents: z.number().int().min(100).max(1_000_000),
  durationDays: z.number().int().min(1).max(90),
  placementType: z.string().max(32).default("feed_top"),
  pricingModel: z.enum(["flat", "cpm", "cpc"]).default("flat"),
  /** Cap on how much Campaign $ to draw — defaults to "all of it". */
  maxCampaignDollarsCents: z.number().int().min(0).optional(),
});

boostCheckoutRoutes.post("/", async (c) => {
  const userId = uid(c);
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);

  const parsed = CheckoutSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) {
    return c.json(error("VALIDATION_ERROR", "Invalid checkout payload", parsed.error.flatten()), 400);
  }
  const r = await startBoostCheckout(userId, parsed.data);
  return c.json(
    success({
      boostId: r.boost.id,
      checkoutId: r.checkoutId,
      totalCents: r.totalCents,
      campaignDollarsCents: r.campaignDollarsCents,
      usdCents: r.usdCents,
      fullyCoveredByCampaign: r.fullyCoveredByCampaign,
      /** When USD is owed: POST /:checkoutId/pay opens the widget for the
       *  amount due, then POST /:checkoutId/confirm-payment with the
       *  widget's transactionId (verified with the provider). The boost
       *  stays 'pending_payment' until then. */
      requiresFurtherPayment: r.requiresFurtherPayment,
    }),
    r.fullyCoveredByCampaign ? 200 : 202,
  );
});

const PaySchema = z.object({
  successUrl: z.string().url(),
  cancelUrl: z.string().url(),
});

/** Accepts the widget's transaction id; `providerPaymentId` is the legacy name. */
const ConfirmSchema = z
  .object({ transactionId: z.string().min(1).max(100).optional(), providerPaymentId: z.string().min(1).max(100).optional() })
  .refine((v) => Boolean(v.transactionId ?? v.providerPaymentId), { message: "transactionId required" });

const ERROR_STATUS: Record<BoostPaymentErrorCode, 400 | 402 | 403 | 404 | 409 | 503> = {
  NOT_FOUND: 404,
  FORBIDDEN: 403,
  NOTHING_DUE: 409,
  PAYMENTS_UNAVAILABLE: 503,
  PAYMENT_NOT_VERIFIED: 402,
  PAYMENT_ALREADY_USED: 409,
};

type CheckoutRef = { checkoutId: string } | { boostId: string };

function refFrom(c: any): CheckoutRef {
  const boostId = c.req.param("boostId");
  return boostId ? { boostId } : { checkoutId: c.req.param("id") };
}

async function pay(c: any) {
  const userId = uid(c);
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  const parsed = PaySchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json(error("VALIDATION_ERROR", "successUrl and cancelUrl required"), 400);
  const r = await startBoostPayment(userId, refFrom(c), parsed.data, oneOffPaymentsFromEnv(c.env ?? {}));
  if ("code" in r) return c.json(error(r.code, r.message), ERROR_STATUS[r.code]);
  return c.json(success({ checkoutId: r.checkoutId, usdCents: r.usdCents, collection: r.collection }), 200);
}

/** Verifies the transaction with the payment provider before activating. */
async function confirm(c: any) {
  const userId = uid(c);
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  const parsed = ConfirmSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json(error("VALIDATION_ERROR", "transactionId required"), 400);
  const transactionId = (parsed.data.transactionId ?? parsed.data.providerPaymentId)!;
  const r = await confirmBoostPayment(userId, refFrom(c), transactionId, oneOffPaymentsFromEnv(c.env ?? {}));
  if ("code" in r) return c.json(error(r.code, r.message), ERROR_STATUS[r.code]);
  return c.json(success({ activated: r.activated, pending: r.pending }), r.pending ? 202 : 200);
}

// Confirm hits the payment provider's API; cap it per user so a client
// can't use it to probe transaction ids (same policy as token packs).
const confirmLimiter = createIpRateLimiter({
  windowMs: 15 * 60 * 1000,
  maxAttempts: 20,
  message: "Too many attempts. Please try again in a few minutes.",
  keyOf: (c) => `boost-confirm:${(c.get("user") as { sub?: string } | undefined)?.sub ?? getClientIp(c)}`,
});

// By checkout id (returned from POST /) or by boost id ("Finish payment").
boostCheckoutRoutes.post("/:id/pay", pay);
boostCheckoutRoutes.post("/:id/confirm-payment", confirmLimiter, confirm);
boostCheckoutRoutes.post("/boosts/:boostId/pay", pay);
boostCheckoutRoutes.post("/boosts/:boostId/confirm-payment", confirmLimiter, confirm);

boostCheckoutRoutes.all("*", (c) =>
  c.json({ error: { code: "NOT_FOUND", message: "Boost checkout route not found" } }, 404),
);
