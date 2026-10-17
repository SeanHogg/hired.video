/**
 * Checkout kind "job_boost" — sponsor one of the caller's posted jobs
 * (search_top / discovery_feed placement, gap #106).
 *
 *   start    owner gate → price (computeBoostPricing, #1764) → job_boosts
 *            row in `pending_payment`. The job is NOT sponsored yet.
 *   pay      open the one-off payment widget for exactly the budget.
 *   confirm  re-read the provider transaction (isApprovedOneOffPayment):
 *            approved, USD, exact amount, this user's customer — then claim
 *            it single-use (no other job boost / boost checkout / token pack
 *            / course checkout used the id), activate the boost with the run
 *            window re-stamped from the payment time, and only THEN mark the
 *            job sponsored. A provider outage leaves it pending; confirm
 *            again later.
 *
 * Key = job_boosts id. Table access lives in AdPromotionRepository.
 */
import { checkoutIdFor, type CheckoutDTO } from "../../../../../../shared/checkout.js";
import { getDb } from "../../../../db/index.js";
import { logger } from "../../../../lib/logger.js";
import {
  AdPromotionRepository,
  JOB_BOOST_PENDING_STATUS,
  type JobBoostRow,
} from "../../../../repositories/adPromotionRepository.js";
import { adSubjectColumns } from "../../../advertising/content-target.js";
import { computeBoostPricing } from "../../../advertising/pricing.js";
import { isApprovedOneOffPayment } from "../../payment/oneOffPayments.js";
import type { ProviderTransaction } from "../../payment/types.js";
import {
  CHECKOUT_CURRENCY,
  CheckoutError,
  requireOneOffPayments,
  type CheckoutKindHandler,
} from "../types.js";

export type JobBoostCheckoutRepo = Pick<
  AdPromotionRepository,
  "isJobPostedBy" | "insertJobBoost" | "findJobBoostById" | "claimJobBoostPayment" | "markJobSponsored"
>;

const DAY_MS = 86_400_000;

function isPending(row: JobBoostRow): boolean {
  return row.status === JOB_BOOST_PENDING_STATUS;
}

/** The public view of a job boost row (start response). */
function toView(row: JobBoostRow): Record<string, unknown> {
  return {
    id: row.id,
    jobId: row.jobId,
    placementType: row.placementType,
    pricingModel: row.pricingModel,
    budgetCents: row.budgetCents,
    rateUnitCents: row.rateUnitCents,
    status: row.status,
    startsAt: row.startsAt,
    endsAt: row.endsAt,
    createdAt: row.createdAt,
  };
}

function toDTO(row: JobBoostRow, withBoost = false): CheckoutDTO<"job_boost"> {
  const pending = isPending(row);
  return {
    id: checkoutIdFor("job_boost", row.id),
    kind: "job_boost",
    status: pending ? "pending" : "paid",
    totalCents: row.budgetCents,
    amountDueCents: pending ? row.budgetCents : 0,
    currency: CHECKOUT_CURRENCY,
    details: { jobBoostId: row.id, jobId: row.jobId, ...(withBoost ? { boost: toView(row) } : {}) },
  };
}

async function ownedBoost(repo: JobBoostCheckoutRepo, userId: string, key: string): Promise<JobBoostRow> {
  const row = await repo.findJobBoostById(key);
  if (!row) throw new CheckoutError("NOT_FOUND", "Checkout not found");
  if (row.userId !== userId) throw new CheckoutError("FORBIDDEN", "Not owner of this checkout");
  return row;
}

/** The paid run length, preserved from the priced window. */
function runLengthMs(row: JobBoostRow): number {
  const start = new Date(row.startsAt).getTime();
  const end = row.endsAt ? new Date(row.endsAt).getTime() : start + DAY_MS;
  return Math.max(DAY_MS, end - start);
}

export function createJobBoostCheckoutKind(
  repoFor: () => JobBoostCheckoutRepo = () => new AdPromotionRepository(getDb()),
): CheckoutKindHandler<"job_boost"> {
  return {
    kind: "job_boost",

    async start(ctx, input) {
      const repo = repoFor();
      if (!(await repo.isJobPostedBy(input.jobId, ctx.userId))) {
        throw new CheckoutError("NOT_FOUND", "Job not found or not owned by you");
      }
      const pricing = computeBoostPricing(input);
      const target = adSubjectColumns({ subjectType: "job", subjectId: input.jobId });
      const row = await repo.insertJobBoost({
        jobId: input.jobId,
        subjectType: target.subjectType,
        subjectId: target.subjectId,
        userId: ctx.userId,
        placementType: input.placementType,
        pricingModel: input.pricingModel,
        budgetCents: pricing.totalCents,
        rateUnitCents: pricing.rateUnitCents,
        status: JOB_BOOST_PENDING_STATUS,
        startsAt: pricing.startsAt,
        endsAt: pricing.endsAt,
      });
      return toDTO(row, true);
    },

    async get(ctx, key) {
      return toDTO(await ownedBoost(repoFor(), ctx.userId, key));
    },

    async pay(ctx, key, urls) {
      const row = await ownedBoost(repoFor(), ctx.userId, key);
      if (!isPending(row) || row.budgetCents <= 0) {
        throw new CheckoutError("NOTHING_DUE", "Nothing is owed on this boost");
      }
      const payments = requireOneOffPayments(ctx.payments);
      const customerId = await payments.customerIdFor(ctx.userId);
      const collection = await payments.initPurchase({
        customerId,
        amount: row.budgetCents / 100,
        currency: CHECKOUT_CURRENCY,
        ...urls,
      });
      return { id: checkoutIdFor("job_boost", key), amountDueCents: row.budgetCents, collection };
    },

    async confirm(ctx, key, transactionId) {
      const repo = repoFor();
      const row = await ownedBoost(repo, ctx.userId, key);
      const id = checkoutIdFor("job_boost", key);
      if (!isPending(row)) {
        // Replaying the same payment is idempotent; any other id is refused.
        if (row.stripePaymentIntentId === transactionId) {
          return { id, kind: "job_boost", pending: false, outcome: { activated: false } };
        }
        throw new CheckoutError("NOTHING_DUE", "This boost is already paid");
      }
      const payments = requireOneOffPayments(ctx.payments);

      let tx: ProviderTransaction | null;
      let customerId: string;
      try {
        [tx, customerId] = await Promise.all([payments.getTransaction(transactionId), payments.customerIdFor(ctx.userId)]);
      } catch (err) {
        logger.warn("[job-boost-checkout] provider check failed; boost stays pending", { jobBoostId: key, error: err });
        return { id, kind: "job_boost", pending: true, outcome: { activated: false } };
      }
      if (!tx || !isApprovedOneOffPayment(tx, { amountCents: row.budgetCents, currency: CHECKOUT_CURRENCY, customerId })) {
        throw new CheckoutError("PAYMENT_NOT_VERIFIED", "We couldn't verify that payment");
      }

      const startsAt = new Date();
      const endsAt = new Date(startsAt.getTime() + runLengthMs(row));
      const activated = await repo.claimJobBoostPayment(row.id, tx.id || transactionId, { startsAt, endsAt });
      if (!activated) throw new CheckoutError("PAYMENT_ALREADY_USED", "That payment was already used");
      // Sponsorship goes live only after the confirmed, claimed payment.
      await repo.markJobSponsored(row.jobId, endsAt);
      return { id, kind: "job_boost", pending: false, outcome: { activated: true } };
    },
  };
}
