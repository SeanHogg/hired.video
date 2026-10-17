/**
 * Affiliate programme use cases for the signed-in affiliate (profile,
 * dashboard, stats, referrals/conversions, payout requests) plus the public
 * click tracker and leaderboard. Return plain data; throw DomainError.
 */
import { DomainError } from "../../domains/errors.js";
import {
  countClicks,
  countConversions,
  findLeaderboardRows,
  findProfileByUserId,
  findProfileIdByReferralCode,
  findReferralCodesByProfileIds,
  findUserName,
  insertClick,
  insertPayout,
  insertProfile,
  listConversions,
  listPayouts,
  listReferrals,
  sumCommissionByStatus,
  updateProfile,
  type AffiliateProfilePatch,
} from "../../repositories/affiliatesRepository.js";
import { generateReferralCode, getAffiliateTier, getNextAffiliateTier } from "./affiliateTiers.js";

const MIN_PAYOUT_USD = 50;
const toCents = (v: unknown) => Math.round(Number(v ?? 0) * 100);

/** Get (auto-creating on first access) the caller's affiliate profile with tier info. */
export async function getOrCreateAffiliateProfile(userId: string) {
  let profile = await findProfileByUserId(userId);
  if (!profile) {
    const name = await findUserName(userId);
    profile = await insertProfile({
      userId,
      referralCode: generateReferralCode(name ?? userId),
      commissionRate: "0.10",
      status: "active",
    });
  }

  const { total: conversions } = await countConversions(profile.id);
  const tier = getAffiliateTier(conversions);
  const nextTier = getNextAffiliateTier(conversions);

  return {
    ...profile,
    tier: tier.name,
    tierLabel: tier.label,
    commissionRate: tier.commissionRate,
    conversions,
    nextTier: nextTier
      ? { name: nextTier.name, label: nextTier.label, conversionsNeeded: nextTier.minConversions - conversions }
      : null,
    referralUrl: `${process.env.FRONTEND_URL ?? "https://hired.video"}/?ref=${profile.referralCode}`,
  };
}

/** Update payout email and/or sector specialization (1..5 sectors). */
export async function updateAffiliateProfile(
  userId: string,
  input: { payoutEmail?: unknown; specialtySectors?: unknown },
) {
  const profile = await findProfileByUserId(userId);
  if (!profile) throw new DomainError(404, "NOT_FOUND", "Affiliate profile not found");

  const patch: AffiliateProfilePatch = { updatedAt: new Date() };
  if (input.payoutEmail) patch.payoutEmail = input.payoutEmail as string;
  // Sector specialization — not validated against the SECTORS enum on
  // purpose: marketing adds sectors faster than schema bumps (same reasoning
  // as no CHECK constraint in migration 0112). Empty array = generalist.
  if (Array.isArray(input.specialtySectors)) {
    patch.specialtySectors = input.specialtySectors
      .filter((s: unknown): s is string => typeof s === "string")
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 5);
  }
  return updateProfile(profile.id, patch);
}

/**
 * Record a referral link click (public). `landingSector` powers per-sector CTR
 * analytics + specialist-bonus matching (migration 0112); when omitted it is
 * auto-derived from a `/sectors/<slug>` targetPath.
 */
export async function trackAffiliateClick(input: {
  referralCode: unknown;
  targetPath: string | null;
  landingSector: unknown;
  ipAddress: string | null;
  userAgent: string | null;
  referer: string | null;
}): Promise<{ tracked: true }> {
  const code = String(input.referralCode ?? "").trim().toUpperCase();
  if (!code) throw new DomainError(400, "VALIDATION_ERROR", "referralCode is required");

  const affiliateId = await findProfileIdByReferralCode(code);
  if (!affiliateId) throw new DomainError(404, "NOT_FOUND", "Invalid referral code");

  const target = input.targetPath;
  let landingSector: string | null = null;
  if (typeof input.landingSector === "string" && input.landingSector.trim()) {
    landingSector = input.landingSector.trim().slice(0, 64);
  } else if (target) {
    const match = /^\/sectors\/([a-z_]+)/i.exec(target);
    if (match?.[1]) landingSector = match[1];
  }

  await insertClick({
    affiliateId,
    referralCode: code,
    targetPath: target,
    landingSector,
    ipAddress: input.ipAddress,
    userAgent: input.userAgent,
    referer: input.referer,
  });
  return { tracked: true };
}

/** Aggregated dashboard data (empty shape when the caller isn't an affiliate). */
export async function getAffiliateDashboard(userId: string) {
  const profile = await findProfileByUserId(userId);
  if (!profile) {
    return { referrals: [], conversions: [], payouts: [], totals: { pendingCents: 0, paidCents: 0 } };
  }

  const referrals = await listReferrals(profile.id, 100);
  const conversions = await listConversions(profile.id, 100);
  const payouts = await listPayouts(profile.id, 50);
  const pending = await sumCommissionByStatus(profile.id, "pending");
  const paid = await sumCommissionByStatus(profile.id, "paid");

  return {
    referrals: referrals.map((r) => ({
      id: r.id,
      referredUserId: r.referredUserId,
      referralCode: r.referralCode ?? "",
      createdAt: new Date(r.createdAt).toISOString(),
    })),
    conversions: conversions.map((cv) => ({
      id: cv.id,
      referredUserId: cv.referralId ?? "",
      subscriptionAmountCents: toCents(cv.revenue),
      commissionAmountCents: toCents(cv.commission),
      status: cv.status,
      createdAt: new Date(cv.createdAt).toISOString(),
    })),
    payouts: payouts.map((p) => ({
      id: p.id,
      amountCents: toCents(p.amount),
      status: p.status,
      requestedAt: new Date(p.createdAt).toISOString(),
      paidAt: p.processedAt ? new Date(p.processedAt).toISOString() : null,
    })),
    totals: { pendingCents: toCents(pending), paidCents: toCents(paid) },
  };
}

/** Earnings / clicks / conversions summary. */
export async function getAffiliateStats(userId: string) {
  const profile = await findProfileByUserId(userId);
  if (!profile) return { conversions: 0, clicks: 0, totalEarned: 0, pendingEarnings: 0 };

  const conv = await countConversions(profile.id);
  const pending = await sumCommissionByStatus(profile.id, "pending");
  const clicks = await countClicks(profile.id);
  const conversions = conv.total;
  const tier = getAffiliateTier(conversions);

  return {
    tier: tier.name,
    tierLabel: tier.label,
    conversions,
    clicks,
    conversionRate: clicks > 0 ? Math.round((conversions / clicks) * 100) : 0,
    totalEarned: Number(conv.earned ?? 0),
    pendingEarnings: Number(pending ?? 0),
    totalPaid: Number(profile.totalPaid ?? 0),
  };
}

/** Top 20 affiliates by paid conversions (referral code as the public handle — no PII). */
export async function getAffiliateLeaderboard() {
  const rows = await findLeaderboardRows(20);
  const codes = await findReferralCodesByProfileIds(rows.map((r) => r.affiliateId));
  return rows.map((r, i) => {
    const convs = Number(r.conversions);
    return {
      rank: i + 1,
      handle: codes[r.affiliateId] ?? "—",
      tier: getAffiliateTier(convs).name,
      conversions: convs,
      earned: Number(r.earned ?? 0),
    };
  });
}

/** Referrals for an affiliate by OWNER user id ([] when not an affiliate). */
export async function listAffiliateReferralsForUser(userId: string, limit: number) {
  const profile = await findProfileByUserId(userId);
  return profile ? listReferrals(profile.id, limit) : [];
}

/** Conversions for an affiliate by OWNER user id ([] when not an affiliate). */
export async function listAffiliateConversionsForUser(userId: string, limit: number) {
  const profile = await findProfileByUserId(userId);
  return profile ? listConversions(profile.id, limit) : [];
}

/** Request a payout of all pending commission (minimum $50, payout email required). */
export async function requestAffiliatePayout(userId: string) {
  const profile = await findProfileByUserId(userId);
  if (!profile) throw new DomainError(404, "NOT_FOUND", "Affiliate profile not found");

  const pendingAmount = Number((await sumCommissionByStatus(profile.id, "pending")) ?? 0);
  if (pendingAmount < MIN_PAYOUT_USD) throw new DomainError(402, "PAYMENT_REQUIRED", "Minimum payout is $50");
  if (!profile.payoutEmail) {
    throw new DomainError(400, "VALIDATION_ERROR", "Please set a payout email in your profile");
  }

  const payout = await insertPayout({
    affiliateId: profile.id,
    amount: String(pendingAmount),
    currency: "USD",
    status: "pending",
    payoutMethod: "bank_transfer",
  });
  return { ...payout, note: "Payout request submitted. Processing within 5–7 business days." };
}
