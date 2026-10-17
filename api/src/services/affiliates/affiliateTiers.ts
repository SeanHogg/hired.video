/**
 * Affiliate tier ladder (#74): Bronze → Silver → Gold → Platinum by
 * conversion count, plus the referral-code shape minted on first access.
 * Pure — no I/O.
 */

// Tier definitions (mirrors affiliateTiers table seed data), highest first.
export const AFFILIATE_TIERS = [
  { name: "platinum", label: "Platinum Ambassador", minConversions: 200, commissionRate: 0.25, bonusPercentage: 0.10 },
  { name: "gold",     label: "Gold Ambassador",     minConversions: 50,  commissionRate: 0.20, bonusPercentage: 0.05 },
  { name: "silver",   label: "Silver Ambassador",   minConversions: 10,  commissionRate: 0.15, bonusPercentage: 0.02 },
  { name: "bronze",   label: "Bronze Affiliate",    minConversions: 0,   commissionRate: 0.10, bonusPercentage: 0 },
] as const;

export type AffiliateTier = (typeof AFFILIATE_TIERS)[number];

export function getAffiliateTier(conversions: number): AffiliateTier {
  return AFFILIATE_TIERS.find((t) => conversions >= t.minConversions) ?? AFFILIATE_TIERS[AFFILIATE_TIERS.length - 1];
}

/** The next tier up (lowest tier whose threshold is above `conversions`), or undefined at the top. */
export function getNextAffiliateTier(conversions: number): AffiliateTier | undefined {
  return AFFILIATE_TIERS.slice().reverse().find((t) => t.minConversions > conversions);
}

export function generateReferralCode(name: string): string {
  const base = name.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6).padEnd(4, "X");
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `${base}${rand}`;
}
