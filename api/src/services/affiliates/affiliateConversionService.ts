/**
 * Affiliate conversion recording — runs from the payment webhook on a
 * referred user's first subscription payment (provider-agnostic).
 */
import type { getDb } from "../../db/index.js";
import { applySpecialtyBonus } from "../../../../shared/sectors.js";
import * as affiliatesRepo from "../../repositories/affiliatesRepository.js";

export async function recordAffiliateConversion(
  db: ReturnType<typeof getDb>,
  userId: string,
  revenue: number,
  _currency: string,
): Promise<void> {
  // Two sequential reads instead of a single join — webhook path runs at
  // most once per payment, so the extra roundtrip is irrelevant. Splits
  // cleanly across the join boundary the fake-db harness doesn't model,
  // which is what keeps the regression tests in
  // routes/__tests__/recordAffiliateConversion.test.ts viable.
  const referral = await affiliatesRepo.findReferralByReferredUserId(userId, db);
  if (!referral) return;
  // Idempotency guard (#1196). Without this, every recurring-subscription
  // webhook would mint a new commission and bump totalEarned — affiliates
  // would be credited every month for a single referred user. Stamp
  // `convertedAt` on first conversion; subsequent webhooks for the same
  // referral short-circuit here.
  if (referral.convertedAt) return;

  const profile = await affiliatesRepo.findProfileCommissionTerms(referral.affiliateId, db);
  if (!profile) return; // affiliate profile was deleted after the referral

  // Vertical-specialty bonus engine (#1166). Pure shared helper composes
  // baseRate + tier bonus + flat sector-match bonus. Tier bonus is not
  // joined yet (the affiliate-tier ladder is a follow-on table); for now
  // we pass tierBonus=0 and the specialty multiplier is the only modifier
  // on top of the base commission rate.
  const specialty = applySpecialtyBonus({
    baseRate: Number(profile.commissionRate),
    tierBonus: 0,
    specialtySectors: (profile.specialtySectors as string[]) ?? [],
    landingSector: referral.landingSector,
  });
  const commission = revenue * specialty.effectiveRate;

  // Atomic claim (#1684). The Neon HTTP driver can't span statements in a
  // transaction, so instead of insert-then-stamp (which double-credits if a
  // retry lands between the two), we CLAIM the referral first with a
  // conditional update on `convertedAt IS NULL`. Postgres makes the single
  // UPDATE atomic, so exactly one webhook run wins the claim; the rest bail.
  // Worst case on a mid-fan-out crash is one missed credit (re-runnable),
  // not a duplicate — the safe failure direction.
  if (!(await affiliatesRepo.claimReferralConversion(referral.id, db))) return;

  await affiliatesRepo.insertConversion({
    affiliateId: referral.affiliateId,
    referralId: referral.id,
    conversionType: "subscription",
    revenue: String(revenue),
    commission: String(commission),
    status: "pending",
  } as any, db);

  // Accumulator fix (#1197). Read the column directly off the profile row
  // (a prior bug indexed an already-destructured value, so totalEarned was
  // overwritten to a single commission each time).
  const newTotal = Number(profile.totalEarned ?? 0) + commission;
  await affiliatesRepo.setProfileTotalEarned(referral.affiliateId, String(newTotal), db);
}
