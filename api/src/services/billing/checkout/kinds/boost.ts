/**
 * Checkout kind "boost" — paid promotion of a user-generated subject.
 * Adapts services/advertising/boost-checkout.ts (pricing, Campaign $ draw,
 * provider-verified single-use payment) and adds the owner gate: only the
 * owner of a subject may promote it.
 *
 * Key = boost id (each checkout creates exactly one boost), so "Finish
 * payment" on a pending boost needs nothing but the boost row.
 */
import { checkoutIdFor, type CheckoutDTO } from "../../../../../../shared/checkout.js";
import { getDb } from "../../../../db/index.js";
import { BoostSubjectsRepository } from "../../../../repositories/boostSubjectsRepository.js";
import {
  BOOST_CURRENCY,
  confirmBoostPayment,
  getBoostCheckout,
  isError,
  startBoostCheckout,
  startBoostPayment,
  toBoostView,
  type BoostPaymentError,
  type CheckoutRecord,
} from "../../../advertising/boost-checkout.js";
import { CheckoutError, type CheckoutKindHandler } from "../types.js";

function fail(e: BoostPaymentError): never {
  throw new CheckoutError(e.code, e.message);
}

function toStatus(raw: string): CheckoutDTO<"boost">["status"] {
  if (raw === "paid" || raw === "refunded") return raw;
  return raw === "failed" ? "expired" : "pending";
}

function recordToDTO(boostId: string, r: CheckoutRecord): CheckoutDTO<"boost"> {
  const status = toStatus(r.status);
  return {
    id: checkoutIdFor("boost", boostId),
    kind: "boost",
    status,
    totalCents: r.totalCents ?? r.usdCents,
    amountDueCents: status === "pending" ? r.usdCents : 0,
    currency: BOOST_CURRENCY,
    details: { boostId, campaignDollarsCents: r.campaignDollarsCents },
  };
}

export function createBoostCheckoutKind(
  subjects: () => Pick<BoostSubjectsRepository, "ownerOf"> = () => new BoostSubjectsRepository(getDb()),
): CheckoutKindHandler<"boost"> {
  return {
    kind: "boost",

    async start(ctx, input) {
      // Owner gate: when the subject type has an owner lookup, the caller
      // must be that owner; unwired types fall through (opt in later).
      const ownerId = await subjects().ownerOf(input.subjectType, input.subjectId);
      if (ownerId !== null && ownerId !== ctx.userId) {
        throw new CheckoutError("FORBIDDEN", "You can only promote your own content");
      }
      const r = await startBoostCheckout(ctx.userId, {
        subjectType: input.subjectType,
        subjectId: input.subjectId,
        budgetCents: input.budgetCents,
        durationDays: input.durationDays,
        placementType: input.placementType,
        pricingModel: input.pricingModel,
        maxCampaignDollarsCents: input.maxCampaignDollarsCents,
      });
      return {
        id: checkoutIdFor("boost", r.boost.id),
        kind: "boost",
        status: r.fullyCoveredByCampaign ? "paid" : "pending",
        totalCents: r.totalCents,
        amountDueCents: r.usdCents,
        currency: BOOST_CURRENCY,
        details: {
          boostId: r.boost.id,
          campaignDollarsCents: r.campaignDollarsCents,
          boost: toBoostView(r.boost),
        },
      };
    },

    async get(ctx, key) {
      const r = await getBoostCheckout(ctx.userId, { boostId: key });
      if (isError(r)) fail(r);
      return recordToDTO(key, r);
    },

    async pay(ctx, key, urls) {
      const r = await startBoostPayment(ctx.userId, { boostId: key }, urls, ctx.payments);
      if ("code" in r) fail(r);
      return { id: checkoutIdFor("boost", key), amountDueCents: r.usdCents, collection: r.collection };
    },

    async confirm(ctx, key, transactionId) {
      const r = await confirmBoostPayment(ctx.userId, { boostId: key }, transactionId, ctx.payments);
      if ("code" in r) fail(r);
      return { id: checkoutIdFor("boost", key), kind: "boost", pending: r.pending, outcome: { activated: r.activated } };
    },
  };
}
