/**
 * /api/boost-checkout — #177 paid boost checkout.
 *
 * Splits the requested boost spend between Campaign $ (gamification
 * redemption ledger) and USD. The flow is:
 *
 *   1. Caller hits POST /api/boost-checkout with a draft boost payload.
 *   2. We compute the total cost (= boost.budgetCents — flat pricing
 *      today; CPM/CPC checkout deferred to ad-set spend metering).
 *   3. We debit as much Campaign $ as is available (capped at the total).
 *   4. The remainder is the USD amount the existing payment provider
 *      collects. Today we just record it on the boost_checkouts ledger
 *      row and let the existing /api/payment flow attach the
 *      providerPaymentId out-of-band — keeping money handling out of this
 *      router makes the Stripe / Helcim swap a one-file change.
 *   5. The boost row is created with status='pending_payment' when USD
 *      is owed, or 'active' when Campaign $ covered everything.
 */

import { Hono } from "hono";
import { z } from "zod";
import { eq } from "drizzle-orm";
import type { AppEnv } from "../types/index.js";
import { success, error } from "../types/index.js";
import { UuidLikeSchema } from "../../../shared/validation.js";
import { getDb, schema } from "../db/index.js";
import { buildRepos } from "../repositories/index.js";

const { boosts, boostCheckouts } = schema;

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
  const body = parsed.data;
  const db = getDb();
  const repos = buildRepos(db);

  const totalCents = body.budgetCents;
  const startsAt = new Date();
  const endsAt = new Date(startsAt.getTime() + body.durationDays * 86_400_000);
  const rateUnitCents =
    body.pricingModel === "flat"
      ? Math.max(1, Math.round(body.budgetCents / body.durationDays))
      : null;

  // Pre-create the boost row in 'pending_payment'; we flip status once
  // Campaign $ / USD wiring resolves below.
  const [boost] = await db
    .insert(boosts)
    .values({
      userId,
      subjectType: body.subjectType,
      subjectId: body.subjectId,
      placementType: body.placementType,
      pricingModel: body.pricingModel,
      budgetCents: totalCents,
      rateUnitCents,
      status: "pending_payment",
      startsAt,
      endsAt,
    } as any)
    .returning();

  const [checkout] = await db
    .insert(boostCheckouts)
    .values({
      userId,
      boostId: boost.id,
      totalCents,
      status: "pending",
    })
    .returning();

  // Step 1 — draw Campaign $.
  const cap = body.maxCampaignDollarsCents ?? totalCents;
  const desiredCampaign = Math.max(0, Math.min(cap, totalCents));
  const { spentCents: campaignDollarsCents } = await repos.points.spendCampaignDollars({
    userId,
    maxCents: desiredCampaign,
    referenceId: checkout.id,
    referenceType: "boost_checkout",
    description: `Boost on ${body.subjectType}:${body.subjectId}`,
  });

  const usdCents = totalCents - campaignDollarsCents;

  // Step 2 — record split and flip boost status if Campaign $ covered it all.
  const fullyCoveredByCampaign = usdCents <= 0;
  const now = new Date();
  await db
    .update(boostCheckouts)
    .set({
      campaignDollarsCents,
      usdCents,
      status: fullyCoveredByCampaign ? "paid" : "pending",
      paidAt: fullyCoveredByCampaign ? now : null,
      updatedAt: now,
    })
    .where(eq(boostCheckouts.id, checkout.id));

  if (fullyCoveredByCampaign) {
    await db
      .update(boosts)
      .set({ status: "active", updatedAt: now })
      .where(eq(boosts.id, boost.id));
  }

  return c.json(
    success({
      boostId: boost.id,
      checkoutId: checkout.id,
      totalCents,
      campaignDollarsCents,
      usdCents,
      fullyCoveredByCampaign,
      /** When USD is owed, the caller follows up via the existing
       *  /api/payment flow and POSTs /confirm-payment with the
       *  providerPaymentId. That webhook handler is responsible for
       *  flipping the boost_checkouts row + the boost row. */
      requiresFurtherPayment: !fullyCoveredByCampaign,
    }),
    fullyCoveredByCampaign ? 200 : 202,
  );
});

const ConfirmSchema = z.object({
  providerPaymentId: z.string().min(1),
});

/** Called by the existing payment webhook when the USD slice clears. */
boostCheckoutRoutes.post("/:id/confirm-payment", async (c) => {
  const userId = uid(c);
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  const parsed = ConfirmSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) {
    return c.json(error("VALIDATION_ERROR", "providerPaymentId required"), 400);
  }

  const db = getDb();
  const [checkout] = await db
    .select()
    .from(boostCheckouts)
    .where(eq(boostCheckouts.id, c.req.param("id")))
    .limit(1);
  if (!checkout) return c.json(error("NOT_FOUND", "Checkout not found"), 404);
  if (checkout.userId !== userId) {
    return c.json(error("FORBIDDEN", "Not owner of this checkout"), 403);
  }

  const now = new Date();
  await db
    .update(boostCheckouts)
    .set({
      providerPaymentId: parsed.data.providerPaymentId,
      status: "paid",
      paidAt: now,
      updatedAt: now,
    })
    .where(eq(boostCheckouts.id, checkout.id));

  if (checkout.boostId) {
    await db
      .update(boosts)
      .set({ status: "active", updatedAt: now })
      .where(eq(boosts.id, checkout.boostId));
  }
  return c.json(success({ ok: true }), 200);
});

boostCheckoutRoutes.all("*", (c) =>
  c.json({ error: { code: "NOT_FOUND", message: "Boost checkout route not found" } }, 404),
);
