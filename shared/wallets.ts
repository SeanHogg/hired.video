/**
 * Wallet registry — the single source of truth for the polymorphic
 * `wallet_balances` / `wallet_ledger` discriminators (architecture
 * remediation W3-B, migrations 0590 + 0595).
 *
 * One wallet = one (owner_kind, owner_id, currency_kind) balance row. Every
 * stored-value surface in the product is a currency here:
 *
 *   ai_tokens          purchased AI-token packs (user) / company top-up pool
 *   enrichment_credits contact-enrichment credits
 *   campaign_dollars   ad/boost credit, in cents
 *   partner_pool       Writer Partner Program accrual, in cents
 *   points             gamification points
 *   phone_cents        prepaid phone-usage balance, in cents
 *
 * The CHECK constraints in the migrations and the Drizzle schema enumerate
 * these same lists — guarded by api/src/repositories/__tests__/wallet-migration.test.ts.
 */

export const WALLET_OWNER_KINDS = ["user", "company"] as const;
export type WalletOwnerKind = (typeof WALLET_OWNER_KINDS)[number];

export const WALLET_CURRENCY_KINDS = [
  "ai_tokens",
  "enrichment_credits",
  "campaign_dollars",
  "partner_pool",
  "points",
  "phone_cents",
] as const;
export type WalletCurrencyKind = (typeof WALLET_CURRENCY_KINDS)[number];

/** Ledger entry types, per currency. The union is what the `type` CHECK
 *  enumerates; the per-currency lists document which writer uses which. */
export const WALLET_LEDGER_TYPES_BY_CURRENCY = {
  enrichment_credits: ["purchase", "deduction", "refund", "monthly_grant"],
  campaign_dollars: ["grant_redemption", "boost_spend", "ad_spend", "refund"],
  phone_cents: ["purchase", "call_charge", "sms_charge", "refund", "monthly_grant"],
  points: ["earn", "redeem", "adjust", "reverse", "streak_bonus", "badge_bonus"],
} as const satisfies Partial<Record<WalletCurrencyKind, readonly string[]>>;

export const WALLET_LEDGER_TYPES = [
  ...new Set(Object.values(WALLET_LEDGER_TYPES_BY_CURRENCY).flat()),
] as readonly string[];

export type WalletLedgerType =
  (typeof WALLET_LEDGER_TYPES_BY_CURRENCY)[keyof typeof WALLET_LEDGER_TYPES_BY_CURRENCY][number];

export function isWalletOwnerKind(v: unknown): v is WalletOwnerKind {
  return typeof v === "string" && (WALLET_OWNER_KINDS as readonly string[]).includes(v);
}

export function isWalletCurrencyKind(v: unknown): v is WalletCurrencyKind {
  return typeof v === "string" && (WALLET_CURRENCY_KINDS as readonly string[]).includes(v);
}

/** Default auto-top-up config a new phone wallet starts with (the values the
 *  retired `phone_balances` table defaulted to): off, top up $20 below $5. */
export const PHONE_WALLET_AUTO_TOP_UP_DEFAULTS = {
  enabled: false,
  thresholdCents: 500,
  amountCents: 2000,
} as const;
