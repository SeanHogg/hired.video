/**
 * Inbound referral attribution — the single place that turns an affiliate's
 * `?ref=CODE` into an `affiliate_referrals` row (gaps #1683/#1684).
 *
 * Extracted from AuthService.handleRegister so the OAuth callback can attribute
 * "Continue with Google" signups too — previously only the email/password path
 * credited affiliates, so the most common signup routes dropped attribution.
 *
 * Self-referral guards (#1684):
 *   • the affiliate can't refer their own account, and
 *   • a signup from the affiliate's own signup IP is dropped as the cheap
 *     throwaway-account heuristic.
 */

import { and, eq, isNull } from "drizzle-orm";
import { getDb, schema } from "../../db/index.js";

const { affiliateProfiles, affiliateReferrals, affiliateLinkClicks, users } = schema;

export interface ReferralAttributionInput {
  referralCode: string | null | undefined;
  userId: string;
  ipAddress?: string | null;
  userAgent?: string | null;
}

/** Resolve a referral code to an affiliate and stamp the linkage. Best-effort:
 *  unknown/disabled codes, self-referrals, and duplicate inserts (the partial
 *  unique index on referred_user_id) are silently skipped. */
export async function recordReferralAttribution(
  input: ReferralAttributionInput,
  db = getDb(),
): Promise<void> {
  const code = input.referralCode?.trim();
  if (!code) return;

  const [aff] = await db
    .select({ id: affiliateProfiles.id, userId: affiliateProfiles.userId, status: affiliateProfiles.status })
    .from(affiliateProfiles)
    .where(eq(affiliateProfiles.referralCode, code))
    .limit(1);
  if (!aff || aff.status === "disabled") return;

  // Self-referral: the affiliate owns this code.
  if (aff.userId === input.userId) return;

  // Same-device self-referral heuristic: drop when the new account signed up
  // from the affiliate owner's own signup IP.
  if (input.ipAddress) {
    const [owner] = await db
      .select({ signupIp: users.signupIp })
      .from(users)
      .where(eq(users.id, aff.userId))
      .limit(1);
    if (owner?.signupIp && owner.signupIp === input.ipAddress) return;
  }

  try {
    const [referral] = await db.insert(affiliateReferrals).values({
      affiliateId: aff.id,
      referredUserId: input.userId,
      referralCode: code,
      ipAddress: input.ipAddress ?? null,
      userAgent: input.userAgent ?? null,
    } as any).returning({ id: affiliateReferrals.id });

    // Close the click → signup funnel (gap #1684): back-link this affiliate's
    // not-yet-converted click(s) from the same IP to the new referral, so
    // affiliate_link_clicks.converted_referral_id stops being a dead column.
    if (referral?.id && input.ipAddress) {
      await db.update(affiliateLinkClicks)
        .set({ convertedReferralId: referral.id } as any)
        .where(and(
          eq(affiliateLinkClicks.affiliateId, aff.id),
          eq(affiliateLinkClicks.ipAddress, input.ipAddress),
          isNull(affiliateLinkClicks.convertedReferralId),
        ));
    }
  } catch (err) {
    // Idempotency: a duplicate insert under the partial unique index
    // (migration 0116) is the expected outcome for a retried signup — the
    // existing row already attributes the user.
    console.error("[attribution] referral insert failed (likely duplicate):", err);
  }
}
