/**
 * Company / employer seat-based billing (#67) — separate from individual
 * subscriptions, charged per seat at the runtime-configured seat price.
 * Only the company owner may view or change it.
 */
import { getDb } from "../../db/index.js";
import { DomainError } from "../../domains/errors.js";
import { CompaniesRepository } from "../../repositories/companiesRepository.js";
import { CompanySubscriptionsRepository } from "../../repositories/companySubscriptionsRepository.js";
import { getPricingConfig } from "../platform/PricingConfigService.js";

async function assertCompanyOwner(userId: string, companyId: string, forbiddenMessage: string): Promise<void> {
  const company = await new CompaniesRepository(getDb()).findCompanyById(companyId);
  if (!company) throw new DomainError(404, "NOT_FOUND", "Company not found");
  if (company.ownerId !== userId) throw new DomainError(403, "FORBIDDEN", forbiddenMessage);
}

/** Current company plan + seat usage. */
export async function getCompanyBilling(userId: string, companyId: string) {
  await assertCompanyOwner(userId, companyId, "Only the company owner can view billing");

  const repo = new CompanySubscriptionsRepository(getDb());
  const companySub = await repo.findByCompanyId(companyId).catch(() => null);
  const seatsUsed = await repo.countActiveSeats(companyId);

  // No subscription yet → preview at the real configured seat price
  // (admin-editable, defaults to $9.95) rather than a stale hardcoded $49,
  // so the "before you buy" number matches what the seat PATCH will charge.
  const pricing = await getPricingConfig();
  const plan = companySub ?? {
    planTier: "starter",
    seatCount: 1,
    pricePerSeatCents: pricing.seatPriceCents,
    status: "none",
    billingInterval: "monthly",
    stripeSubscriptionId: null,
  };

  const pricePerSeat = plan.pricePerSeatCents / 100;
  return {
    plan: plan.planTier,
    seatCount: plan.seatCount,
    seatsUsed,
    seatsAvailable: Math.max(0, plan.seatCount - seatsUsed),
    pricePerSeatCents: plan.pricePerSeatCents,
    totalMonthly: plan.seatCount * pricePerSeat,
    status: plan.status,
    billingInterval: plan.billingInterval,
    stripeSubscriptionId: plan.stripeSubscriptionId ?? null,
  };
}

/** Add/remove seats. Per-seat price comes from the runtime pricing config —
 *  every seat is the same Pro price by default. */
export async function updateCompanySeats(
  userId: string,
  companyId: string,
  input: { seatCount: number; planTier?: string; billingInterval?: string },
) {
  await assertCompanyOwner(userId, companyId, "Only the company owner can update seats");

  const pricing = await getPricingConfig();
  const result = await new CompanySubscriptionsRepository(getDb()).upsertSeatPlan(companyId, {
    seatCount: input.seatCount,
    planTier: input.planTier ?? "team",
    pricePerSeatCents: pricing.seatPriceCents,
    billingInterval: input.billingInterval ?? "monthly",
  });

  // TODO: sync with Stripe to update subscription quantity when stripeSubscriptionId is set
  return { ...result, totalMonthly: (result.seatCount * result.pricePerSeatCents) / 100 };
}
