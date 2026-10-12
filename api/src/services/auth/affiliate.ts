import { getDb, schema } from "../../db/index.js";

const { affiliateProfiles } = schema;

/**
 * Create the `affiliate_profiles` row for a freshly-registered user.
 *
 * Single SSoT for "turn this user into an affiliate at signup" — shared by
 * the password register path ([AuthService.handleRegister]) and the OAuth
 * callback ([routes/oauth.ts]) so a "Continue with Google" affiliate signup
 * mints the exact same referral code shape + commission defaults as the
 * email/password path (gap #1683 follow-up — creator/affiliate via OAuth).
 *
 * `randomHex` is injected so the password path can stay deterministic under
 * test (deps.randomHex is stubbed); OAuth passes a Web-Crypto impl.
 * Errors are intentionally NOT swallowed here — each caller decides whether a
 * failed profile insert should abort or just log (today both log + continue).
 */
export async function createAffiliateProfileForUser(
  db: ReturnType<typeof getDb>,
  opts: { userId: string; name: string; randomHex: (bytes: number) => string },
): Promise<void> {
  const base = opts.name.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6).padEnd(4, "X");
  const rand = opts.randomHex(2).toUpperCase();
  const referralCode = `${base}${rand}`;
  await db.insert(affiliateProfiles).values({
    userId: opts.userId,
    referralCode,
    commissionRate: "0.10",
    status: "active",
  } as any);
}
