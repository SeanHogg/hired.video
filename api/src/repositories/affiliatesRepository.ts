/**
 * AffiliatesRepository — affiliate / ambassador programme (#74) data access:
 * affiliate_profiles, affiliate_referrals, affiliate_conversions,
 * affiliate_payouts and affiliate_link_clicks. Plain rows only; tiering,
 * payout thresholds and response shaping live in services/affiliates/.
 */
import { and, count, desc, eq, inArray, isNull, sql, sum } from "drizzle-orm";
import { getDb, schema } from "../db/index.js";
import type {
  AffiliateConversion,
  AffiliatePayout,
  AffiliateProfile,
  AffiliateReferral,
  NewAffiliatePayout,
  NewAffiliateProfile,
} from "../db/schema/affiliates.js";

const { affiliateProfiles, affiliateReferrals, affiliateConversions, affiliatePayouts, affiliateLinkClicks, users } =
  schema;

export type AffiliateProfilePatch = Partial<
  Pick<NewAffiliateProfile, "payoutEmail" | "specialtySectors" | "status" | "updatedAt">
>;
export type AffiliatePayoutPatch = Partial<Pick<NewAffiliatePayout, "status" | "processedAt" | "updatedAt">>;
export type AffiliateClickInsert = typeof affiliateLinkClicks.$inferInsert;

// ─── Profiles ───────────────────────────────────────────────────────────────

export async function findProfileByUserId(userId: string): Promise<AffiliateProfile | null> {
  const [row] = await getDb().select().from(affiliateProfiles).where(eq(affiliateProfiles.userId, userId)).limit(1);
  return row ?? null;
}

export async function findProfileIdByReferralCode(code: string): Promise<string | null> {
  const [row] = await getDb()
    .select({ id: affiliateProfiles.id })
    .from(affiliateProfiles)
    .where(eq(affiliateProfiles.referralCode, code))
    .limit(1);
  return row?.id ?? null;
}

export async function findUserName(userId: string): Promise<string | null> {
  const [row] = await getDb().select({ name: users.name }).from(users).where(eq(users.id, userId)).limit(1);
  return row?.name ?? null;
}

export async function insertProfile(values: NewAffiliateProfile): Promise<AffiliateProfile> {
  const [row] = await getDb().insert(affiliateProfiles).values(values).returning();
  return row;
}

export async function updateProfile(profileId: string, patch: AffiliateProfilePatch): Promise<AffiliateProfile> {
  const [row] = await getDb().update(affiliateProfiles).set(patch).where(eq(affiliateProfiles.id, profileId)).returning();
  return row;
}

export async function updateProfileStatusByUserId(
  userId: string,
  status: string,
): Promise<{ id: string; status: string } | null> {
  const [row] = await getDb()
    .update(affiliateProfiles)
    .set({ status, updatedAt: new Date() })
    .where(eq(affiliateProfiles.userId, userId))
    .returning({ id: affiliateProfiles.id, status: affiliateProfiles.status });
  return row ?? null;
}

export async function findReferralCodesByProfileIds(profileIds: string[]): Promise<Record<string, string>> {
  if (profileIds.length === 0) return {};
  const rows = await getDb()
    .select({ id: affiliateProfiles.id, referralCode: affiliateProfiles.referralCode })
    .from(affiliateProfiles)
    .where(inArray(affiliateProfiles.id, profileIds));
  return Object.fromEntries(rows.map((p) => [p.id, p.referralCode]));
}

/** Add a processed payout amount to the affiliate's running `totalPaid`. */
export async function creditTotalPaid(profileId: string, amount: string): Promise<void> {
  await getDb()
    .update(affiliateProfiles)
    .set({ totalPaid: sql`${affiliateProfiles.totalPaid} + ${amount}`, updatedAt: new Date() })
    .where(eq(affiliateProfiles.id, profileId));
}

// ─── Referrals / clicks ─────────────────────────────────────────────────────

export async function listReferrals(affiliateId: string, limit: number): Promise<AffiliateReferral[]> {
  return getDb()
    .select()
    .from(affiliateReferrals)
    .where(eq(affiliateReferrals.affiliateId, affiliateId))
    .orderBy(desc(affiliateReferrals.createdAt))
    .limit(limit);
}

/** Best-effort click insert — failures are swallowed (tracking never 500s). */
export async function insertClick(values: AffiliateClickInsert): Promise<void> {
  await getDb()
    .insert(affiliateLinkClicks)
    .values(values)
    .catch(() => undefined);
}

/** Total clicks for an affiliate; 0 when the count query fails. */
export async function countClicks(affiliateId: string): Promise<number> {
  const [row] = await getDb()
    .select({ total: count() })
    .from(affiliateLinkClicks)
    .where(eq(affiliateLinkClicks.affiliateId, affiliateId))
    .catch(() => [{ total: 0 }]);
  return Number(row?.total ?? 0);
}

// ─── Conversions ────────────────────────────────────────────────────────────

export async function listConversions(affiliateId: string, limit: number): Promise<AffiliateConversion[]> {
  return getDb()
    .select()
    .from(affiliateConversions)
    .where(eq(affiliateConversions.affiliateId, affiliateId))
    .orderBy(desc(affiliateConversions.createdAt))
    .limit(limit);
}

/** Conversion count + total commission (all statuses). */
export async function countConversions(affiliateId: string): Promise<{ total: number; earned: string | null }> {
  const [row] = await getDb()
    .select({ total: count(), earned: sum(affiliateConversions.commission) })
    .from(affiliateConversions)
    .where(eq(affiliateConversions.affiliateId, affiliateId));
  return { total: Number(row?.total ?? 0), earned: row?.earned ?? null };
}

/** Sum of commission for conversions in one status (null when none). */
export async function sumCommissionByStatus(affiliateId: string, status: string): Promise<string | null> {
  const [row] = await getDb()
    .select({ earned: sum(affiliateConversions.commission) })
    .from(affiliateConversions)
    .where(and(eq(affiliateConversions.affiliateId, affiliateId), eq(affiliateConversions.status, status)));
  return row?.earned ?? null;
}

/** Top affiliates by PAID conversion count. */
export async function findLeaderboardRows(limit: number) {
  return getDb()
    .select({
      affiliateId: affiliateConversions.affiliateId,
      conversions: count(affiliateConversions.id),
      earned: sum(affiliateConversions.commission),
    })
    .from(affiliateConversions)
    .where(eq(affiliateConversions.status, "paid"))
    .groupBy(affiliateConversions.affiliateId)
    .orderBy(desc(count(affiliateConversions.id)))
    .limit(limit);
}

/** Mark an affiliate's pending conversions as paid (so they aren't paid twice). */
export async function markPendingConversionsPaid(affiliateId: string): Promise<void> {
  await getDb()
    .update(affiliateConversions)
    .set({ status: "paid", paidAt: new Date(), updatedAt: new Date() })
    .where(and(eq(affiliateConversions.affiliateId, affiliateId), eq(affiliateConversions.status, "pending")));
}

// ─── Payouts ────────────────────────────────────────────────────────────────

export async function listPayouts(affiliateId: string, limit: number): Promise<AffiliatePayout[]> {
  return getDb()
    .select()
    .from(affiliatePayouts)
    .where(eq(affiliatePayouts.affiliateId, affiliateId))
    .orderBy(desc(affiliatePayouts.createdAt))
    .limit(limit);
}

export async function listPayoutsByStatus(status: string, limit: number): Promise<AffiliatePayout[]> {
  return getDb()
    .select()
    .from(affiliatePayouts)
    .where(eq(affiliatePayouts.status, status))
    .orderBy(desc(affiliatePayouts.createdAt))
    .limit(limit);
}

export async function insertPayout(values: NewAffiliatePayout): Promise<AffiliatePayout> {
  const [row] = await getDb().insert(affiliatePayouts).values(values).returning();
  return row;
}

export async function updatePayout(payoutId: string, patch: AffiliatePayoutPatch): Promise<AffiliatePayout | null> {
  const [row] = await getDb().update(affiliatePayouts).set(patch).where(eq(affiliatePayouts.id, payoutId)).returning();
  return row ?? null;
}

export async function findPayoutStatus(payoutId: string): Promise<string | null> {
  const [row] = await getDb()
    .select({ status: affiliatePayouts.status })
    .from(affiliatePayouts)
    .where(eq(affiliatePayouts.id, payoutId))
    .limit(1);
  return row?.status ?? null;
}

/** Provider payout webhook (`payout.paid` / `payout.failed`) — stamp every
 *  affiliate payout carrying that provider transaction id. */
export async function setPayoutStatusByTransactionId(
  transactionId: string,
  status: "paid" | "failed",
  db = getDb(),
): Promise<void> {
  const now = new Date();
  await db
    .update(affiliatePayouts)
    .set({ status, transactionId, ...(status === "paid" ? { processedAt: now } : {}), updatedAt: now } as any)
    .where(eq(affiliatePayouts.transactionId, transactionId));
}

// ─── Conversion recording (payment webhook) ─────────────────────────────────
// `db` is injectable so the webhook path can run against the fake-db harness.

export async function findReferralByReferredUserId(userId: string, db = getDb()) {
  const [row] = await db
    .select({
      id: affiliateReferrals.id,
      affiliateId: affiliateReferrals.affiliateId,
      landingSector: affiliateReferrals.landingSector,
      convertedAt: affiliateReferrals.convertedAt,
    })
    .from(affiliateReferrals)
    .where(eq(affiliateReferrals.referredUserId, userId))
    .limit(1);
  return row ?? null;
}

export async function findProfileCommissionTerms(profileId: string, db = getDb()) {
  const [row] = await db
    .select({
      commissionRate: affiliateProfiles.commissionRate,
      specialtySectors: affiliateProfiles.specialtySectors,
      totalEarned: affiliateProfiles.totalEarned,
    })
    .from(affiliateProfiles)
    .where(eq(affiliateProfiles.id, profileId))
    .limit(1);
  return row ?? null;
}

/** Atomic single-UPDATE claim on `convertedAt IS NULL` (#1684): true only for
 *  the one caller that stamped it. */
export async function claimReferralConversion(referralId: string, db = getDb()): Promise<boolean> {
  const claimed = await db
    .update(affiliateReferrals)
    .set({ convertedAt: new Date() } as any)
    .where(and(eq(affiliateReferrals.id, referralId), isNull(affiliateReferrals.convertedAt)))
    .returning({ id: affiliateReferrals.id });
  return claimed.length > 0;
}

export async function insertConversion(values: typeof affiliateConversions.$inferInsert, db = getDb()): Promise<void> {
  await (db.insert(affiliateConversions) as any).values(values);
}

export async function setProfileTotalEarned(profileId: string, totalEarned: string, db = getDb()): Promise<void> {
  await db
    .update(affiliateProfiles)
    .set({ totalEarned, updatedAt: new Date() } as any)
    .where(eq(affiliateProfiles.id, profileId));
}
