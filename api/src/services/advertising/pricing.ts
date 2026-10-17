/**
 * Boost pricing — the ONE function every boost write prices through
 * (POST /api/checkout {kind:"boost"}, POST /api/advertising/boosts).
 *
 * #1764: the bid-auction vs flat-slot decision (D6) is the owner's and is
 * still open, so this ships FLAT pricing: the buyer's budget IS the charge,
 * spread evenly over the run as the daily rate. CPM / CPC keep their
 * published unit rates for reporting. Switching to an auction later means
 * replacing this one function (plus the metering it would need) — no
 * caller computes a rate or a total on its own.
 */

export type BoostPricingModel = "flat" | "cpm" | "cpc";

/** Published unit rates, in cents. */
export const BOOST_CPM_RATE_CENTS = 500; // $5.00 per 1,000 impressions
export const BOOST_CPC_RATE_CENTS = 5; // $0.05 per click

export interface BoostPricingInput {
  pricingModel: BoostPricingModel;
  budgetCents: number;
  durationDays: number;
  /** Run start; defaults to now. Injected by tests. */
  startsAt?: Date;
}

export interface BoostPricing {
  /** What the buyer is charged up front (flat model: the whole budget). */
  totalCents: number;
  /** Flat: daily slot rate. CPM / CPC: the unit rate. */
  rateUnitCents: number;
  startsAt: Date;
  endsAt: Date;
}

const DAY_MS = 86_400_000;

export function computeBoostPricing(input: BoostPricingInput): BoostPricing {
  if (!Number.isInteger(input.budgetCents) || input.budgetCents <= 0) {
    throw new RangeError("budgetCents must be a positive integer");
  }
  if (!Number.isInteger(input.durationDays) || input.durationDays <= 0) {
    throw new RangeError("durationDays must be a positive integer");
  }
  const startsAt = input.startsAt ?? new Date();
  const endsAt = new Date(startsAt.getTime() + input.durationDays * DAY_MS);
  const rateUnitCents =
    input.pricingModel === "flat"
      ? Math.max(1, Math.round(input.budgetCents / input.durationDays))
      : input.pricingModel === "cpm"
        ? BOOST_CPM_RATE_CENTS
        : BOOST_CPC_RATE_CENTS;
  return { totalCents: input.budgetCents, rateUnitCents, startsAt, endsAt };
}
