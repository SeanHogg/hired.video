/**
 * Paid boost checkout — the ONLY way a polymorphic boost is created and
 * activated. Reached through POST /api/checkout {kind:"boost"} (the boost
 * kind in services/billing/checkout/kinds/boost.ts adapts this module).
 *
 *   startBoostCheckout   price (computeBoostPricing, #1764) → boost
 *                        'pending_payment' + boost_checkouts row → draw
 *                        Campaign $. Fully covered → active. Otherwise the
 *                        USD remainder is owed.
 *   startBoostPayment    open the one-off payment widget for exactly the
 *                        USD owed (server-chosen amount).
 *   confirmBoostPayment  re-read the transaction from the payment provider
 *                        (shared one-off verifier, same as token packs) and
 *                        activate only when it is approved, in USD, for
 *                        exactly the USD owed, on this user's customer, and
 *                        not already used by another boost or token pack
 *                        (single-use claim). A provider outage leaves the
 *                        boost pending; the user can confirm again.
 *
 * Table access is behind BoostCheckoutPort and the provider behind
 * OneOffPaymentsPort, so the money rules are testable without either.
 */

import { and, desc, eq, sql } from "drizzle-orm";
import { getDb, schema } from "../../db/index.js";
import { buildRepos } from "../../repositories/index.js";
import { logger } from "../../lib/logger.js";
import { computeBoostPricing, type BoostPricingModel } from "./pricing.js";
import {
  isApprovedOneOffPayment,
  type OneOffPaymentsPort,
} from "../billing/payment/oneOffPayments.js";
import type { CollectPaymentMethodResult, ProviderTransaction } from "../billing/payment/types.js";

export const BOOST_CURRENCY = "USD";

export interface BoostCheckoutInput {
  subjectType: string;
  subjectId: string;
  budgetCents: number;
  durationDays: number;
  placementType: string;
  pricingModel: BoostPricingModel;
  /** Cap on Campaign $ to draw; defaults to the whole total. */
  maxCampaignDollarsCents?: number;
}

export type BoostRow = typeof schema.boosts.$inferSelect;

export interface CheckoutRecord {
  id: string;
  userId: string;
  boostId: string | null;
  usdCents: number;
  status: string;
  providerPaymentId: string | null;
  totalCents?: number;
  campaignDollarsCents?: number;
}

export interface BoostCheckoutPort {
  insertPendingBoost(row: typeof schema.boosts.$inferInsert): Promise<BoostRow>;
  insertCheckout(row: { userId: string; boostId: string; totalCents: number }): Promise<{ id: string }>;
  spendCampaignDollars(args: {
    userId: string;
    maxCents: number;
    referenceId: string;
    referenceType: "boost_checkout";
    description: string;
  }): Promise<{ spentCents: number }>;
  recordSplit(checkoutId: string, split: { campaignDollarsCents: number; usdCents: number; paid: boolean; at: Date }): Promise<void>;
  activateBoost(boostId: string, at: Date): Promise<BoostRow | null>;
  findCheckout(checkoutId: string): Promise<CheckoutRecord | null>;
  /** Latest checkout of a boost. */
  findCheckoutForBoost(boostId: string): Promise<CheckoutRecord | null>;
  /** pending → paid with this provider payment id, in ONE statement, only
   *  when the id isn't already used by any boost checkout or token pack.
   *  True only for the call that claimed it. */
  claimPayment(checkoutId: string, providerPaymentId: string, at: Date): Promise<boolean>;
}

export interface BoostCheckoutResult {
  boost: BoostRow;
  checkoutId: string;
  totalCents: number;
  campaignDollarsCents: number;
  usdCents: number;
  fullyCoveredByCampaign: boolean;
  requiresFurtherPayment: boolean;
}

export async function startBoostCheckout(
  userId: string,
  input: BoostCheckoutInput,
  port: BoostCheckoutPort = defaultBoostCheckoutPort(),
  now: Date = new Date(),
): Promise<BoostCheckoutResult> {
  const pricing = computeBoostPricing({ ...input, startsAt: now });
  const pending = await port.insertPendingBoost({
    userId,
    subjectType: input.subjectType,
    subjectId: input.subjectId,
    placementType: input.placementType,
    pricingModel: input.pricingModel,
    budgetCents: pricing.totalCents,
    rateUnitCents: pricing.rateUnitCents,
    status: "pending_payment",
    startsAt: pricing.startsAt,
    endsAt: pricing.endsAt,
  });
  const checkout = await port.insertCheckout({ userId, boostId: pending.id, totalCents: pricing.totalCents });

  const cap = input.maxCampaignDollarsCents ?? pricing.totalCents;
  const { spentCents } = await port.spendCampaignDollars({
    userId,
    maxCents: Math.max(0, Math.min(cap, pricing.totalCents)),
    referenceId: checkout.id,
    referenceType: "boost_checkout",
    description: `Boost on ${input.subjectType}:${input.subjectId}`,
  });
  const campaignDollarsCents = Math.max(0, Math.min(spentCents, pricing.totalCents));
  const usdCents = pricing.totalCents - campaignDollarsCents;
  const paid = usdCents <= 0;
  await port.recordSplit(checkout.id, { campaignDollarsCents, usdCents, paid, at: now });
  const boost = paid ? ((await port.activateBoost(pending.id, now)) ?? { ...pending, status: "active" }) : pending;

  return {
    boost,
    checkoutId: checkout.id,
    totalCents: pricing.totalCents,
    campaignDollarsCents,
    usdCents,
    fullyCoveredByCampaign: paid,
    requiresFurtherPayment: !paid,
  };
}

// ─── USD payment ──────────────────────────────────────────────────────────

export type BoostPaymentErrorCode =
  | "NOT_FOUND"
  | "FORBIDDEN"
  | "NOTHING_DUE"
  | "PAYMENTS_UNAVAILABLE"
  | "PAYMENT_NOT_VERIFIED"
  | "PAYMENT_ALREADY_USED";

export type BoostPaymentError = { ok: false; code: BoostPaymentErrorCode; message: string };

/** Resolve a checkout by its id or by its boost id, owner-checked. */
async function ownedCheckout(
  port: BoostCheckoutPort,
  userId: string,
  ref: { checkoutId: string } | { boostId: string },
): Promise<CheckoutRecord | BoostPaymentError> {
  const checkout = "checkoutId" in ref ? await port.findCheckout(ref.checkoutId) : await port.findCheckoutForBoost(ref.boostId);
  if (!checkout) return { ok: false, code: "NOT_FOUND", message: "Checkout not found" };
  if (checkout.userId !== userId) return { ok: false, code: "FORBIDDEN", message: "Not owner of this checkout" };
  return checkout;
}

/** The caller's checkout (by checkout id or boost id), or a typed refusal. */
export function getBoostCheckout(
  userId: string,
  ref: { checkoutId: string } | { boostId: string },
  port: BoostCheckoutPort = defaultBoostCheckoutPort(),
): Promise<CheckoutRecord | BoostPaymentError> {
  return ownedCheckout(port, userId, ref);
}

export function isError(v: CheckoutRecord | BoostPaymentError): v is BoostPaymentError {
  return (v as BoostPaymentError).ok === false;
}

function requirePayments(payments: OneOffPaymentsPort | null): OneOffPaymentsPort | BoostPaymentError {
  if (!payments || !payments.supportsOneOffPurchases) {
    return { ok: false, code: "PAYMENTS_UNAVAILABLE", message: "Payments are unavailable right now" };
  }
  return payments;
}

/** Open the payment widget for exactly the USD owed on this boost. */
export async function startBoostPayment(
  userId: string,
  ref: { checkoutId: string } | { boostId: string },
  urls: { successUrl: string; cancelUrl: string },
  payments: OneOffPaymentsPort | null,
  port: BoostCheckoutPort = defaultBoostCheckoutPort(),
): Promise<{ ok: true; checkoutId: string; usdCents: number; collection: CollectPaymentMethodResult } | BoostPaymentError> {
  const checkout = await ownedCheckout(port, userId, ref);
  if (isError(checkout)) return checkout;
  if (checkout.status !== "pending" || checkout.usdCents <= 0) {
    return { ok: false, code: "NOTHING_DUE", message: "Nothing is owed on this boost" };
  }
  const p = requirePayments(payments);
  if ("ok" in p) return p;
  const customerId = await p.customerIdFor(userId);
  const collection = await p.initPurchase({
    customerId,
    amount: checkout.usdCents / 100,
    currency: BOOST_CURRENCY,
    ...urls,
  });
  return { ok: true, checkoutId: checkout.id, usdCents: checkout.usdCents, collection };
}

export type ConfirmResult =
  | { ok: true; activated: boolean; pending: false }
  /** The provider couldn't answer; nothing changed — confirm again later. */
  | { ok: true; activated: false; pending: true }
  | BoostPaymentError;

/** Verify the provider transaction server-side, then activate the boost. */
export async function confirmBoostPayment(
  userId: string,
  ref: { checkoutId: string } | { boostId: string },
  transactionId: string,
  payments: OneOffPaymentsPort | null,
  port: BoostCheckoutPort = defaultBoostCheckoutPort(),
  now: Date = new Date(),
): Promise<ConfirmResult> {
  const checkout = await ownedCheckout(port, userId, ref);
  if (isError(checkout)) return checkout;
  if (checkout.status === "paid") {
    // Replaying the same payment is idempotent; any other id is refused.
    return checkout.providerPaymentId === transactionId
      ? { ok: true, activated: false, pending: false }
      : { ok: false, code: "NOTHING_DUE", message: "This boost is already paid" };
  }
  if (checkout.usdCents <= 0) return { ok: false, code: "NOTHING_DUE", message: "Nothing is owed on this boost" };
  const p = requirePayments(payments);
  if ("ok" in p) return p;

  let tx: ProviderTransaction | null;
  let customerId: string;
  try {
    [tx, customerId] = await Promise.all([p.getTransaction(transactionId), p.customerIdFor(userId)]);
  } catch (err) {
    logger.warn("[boost-checkout] provider check failed; boost stays pending", { checkoutId: checkout.id, error: err });
    return { ok: true, activated: false, pending: true };
  }
  if (!tx || !isApprovedOneOffPayment(tx, { amountCents: checkout.usdCents, currency: BOOST_CURRENCY, customerId })) {
    return { ok: false, code: "PAYMENT_NOT_VERIFIED", message: "We couldn't verify that payment" };
  }
  if (!(await port.claimPayment(checkout.id, tx.id || transactionId, now))) {
    return { ok: false, code: "PAYMENT_ALREADY_USED", message: "That payment was already used" };
  }
  if (checkout.boostId) await port.activateBoost(checkout.boostId, now);
  return { ok: true, activated: true, pending: false };
}

/** The public view of a boost row (API responses). */
export function toBoostView(row: BoostRow) {
  return {
    id: row.id,
    userId: row.userId,
    subjectType: row.subjectType,
    subjectId: row.subjectId,
    placementType: row.placementType,
    pricingModel: row.pricingModel,
    budgetCents: row.budgetCents,
    spentCents: row.spentCents,
    rateUnitCents: row.rateUnitCents,
    status: row.status,
    impressions: row.impressions,
    clicks: row.clicks,
    startsAt: row.startsAt,
    endsAt: row.endsAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

// ─── Production wiring ────────────────────────────────────────────────────

export function defaultBoostCheckoutPort(db = getDb()): BoostCheckoutPort {
  const { boosts, boostCheckouts, tokenPackPurchases, courseCheckouts } = schema;
  const repos = buildRepos(db);
  const record = {
    id: boostCheckouts.id,
    userId: boostCheckouts.userId,
    boostId: boostCheckouts.boostId,
    usdCents: boostCheckouts.usdCents,
    status: boostCheckouts.status,
    providerPaymentId: boostCheckouts.providerPaymentId,
    totalCents: boostCheckouts.totalCents,
    campaignDollarsCents: boostCheckouts.campaignDollarsCents,
  };
  return {
    async insertPendingBoost(row) {
      const [created] = await db.insert(boosts).values(row).returning();
      return created;
    },
    async insertCheckout(row) {
      const [created] = await db.insert(boostCheckouts).values({ ...row, status: "pending" }).returning({ id: boostCheckouts.id });
      return created;
    },
    spendCampaignDollars: (args) => repos.points.spendCampaignDollars(args),
    async recordSplit(checkoutId, split) {
      await db
        .update(boostCheckouts)
        .set({
          campaignDollarsCents: split.campaignDollarsCents,
          usdCents: split.usdCents,
          status: split.paid ? "paid" : "pending",
          paidAt: split.paid ? split.at : null,
          updatedAt: split.at,
        })
        .where(eq(boostCheckouts.id, checkoutId));
    },
    async activateBoost(boostId, at) {
      const [row] = await db
        .update(boosts)
        .set({ status: "active", updatedAt: at })
        .where(eq(boosts.id, boostId))
        .returning();
      return row ?? null;
    },
    async findCheckout(checkoutId) {
      const [row] = await db.select(record).from(boostCheckouts).where(eq(boostCheckouts.id, checkoutId)).limit(1);
      return row ?? null;
    },
    async findCheckoutForBoost(boostId) {
      const [row] = await db
        .select(record)
        .from(boostCheckouts)
        .where(eq(boostCheckouts.boostId, boostId))
        .orderBy(desc(boostCheckouts.createdAt))
        .limit(1);
      return row ?? null;
    },
    async claimPayment(checkoutId, providerPaymentId, at) {
      const rows = await db
        .update(boostCheckouts)
        .set({ providerPaymentId, status: "paid", paidAt: at, updatedAt: at })
        .where(
          and(
            eq(boostCheckouts.id, checkoutId),
            eq(boostCheckouts.status, "pending"),
            sql`NOT EXISTS (SELECT 1 FROM ${boostCheckouts} AS used WHERE used.provider_payment_id = ${providerPaymentId})`,
            sql`NOT EXISTS (SELECT 1 FROM ${tokenPackPurchases} WHERE ${tokenPackPurchases.stripePaymentIntentId} = ${providerPaymentId})`,
            sql`NOT EXISTS (SELECT 1 FROM ${courseCheckouts} WHERE ${courseCheckouts.providerPaymentId} = ${providerPaymentId})`,
          ),
        )
        .returning({ id: boostCheckouts.id });
      return rows.length > 0;
    },
  };
}
