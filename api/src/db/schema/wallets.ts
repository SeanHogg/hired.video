/**
 * Wallets aggregate (architecture remediation W3-B, migrations 0590 + 0595).
 *
 *   • walletBalances — ONE balance row per (owner_kind, owner_id, currency_kind).
 *     Replaces user_token_balance, company_token_balance, enrichment_credits,
 *     campaign_dollars_balance, partner_program_balances, user_points_balance
 *     and phone_balances (all archived by 0595).
 *   • walletLedger   — append-only movements for the currencies that keep a
 *     per-entry audit trail. Replaces enrichment_transactions,
 *     campaign_dollars_transactions, phone_balance_transactions and
 *     points_ledger.
 *
 * Discriminators + ledger types are registered in shared/wallets.ts; the
 * CHECK lists below must match it (wallet-migration.test.ts).
 *
 * Owner is polymorphic (no FK). A user's wallets are removed with the user by
 * the `wallet_owner_user_delete` trigger (0590), matching the ON DELETE
 * CASCADE the retired per-user tables had.
 *
 * Only ONE module reads or writes these tables:
 * api/src/repositories/wallet/walletRepository.ts.
 */

import { sql } from "drizzle-orm";
import {
  pgTable,
  uuid,
  varchar,
  text,
  integer,
  boolean,
  jsonb,
  timestamp,
  index,
  uniqueIndex,
  check,
} from "drizzle-orm/pg-core";
import { users } from "./users.js";

export const walletBalances = pgTable(
  "wallet_balances",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerKind: varchar("owner_kind", { length: 16 }).notNull(),
    ownerId: uuid("owner_id").notNull(),
    currencyKind: varchar("currency_kind", { length: 24 }).notNull(),
    /** Currently spendable amount, in the currency's unit (tokens, credits,
     *  points or cents). */
    balance: integer("balance").default(0).notNull(),
    /** Lifetime credited (pack grants / purchases / earned points / accrued
     *  partner share). */
    lifetimeGranted: integer("lifetime_granted").default(0).notNull(),
    /** Lifetime debited (consumed tokens / credits, spent cents, redeemed
     *  points, paid-out partner share). */
    lifetimeConsumed: integer("lifetime_consumed").default(0).notNull(),
    /** Lifetime removed by fraud reversal (points). */
    lifetimeReversed: integer("lifetime_reversed").default(0).notNull(),
    /** Frozen wallet: no earning, no spending (points fraud suspension). */
    isSuspended: boolean("is_suspended").default(false).notNull(),
    suspendedAt: timestamp("suspended_at", { withTimezone: true }),
    suspendedReason: text("suspended_reason"),
    /** super_admin who suspended; NULL when the fraud engine did. */
    suspendedBy: uuid("suspended_by").references(() => users.id, { onDelete: "set null" }),
    /** campaign_dollars: points→cents rate snapshotted on first opt-in. */
    rateCentsPer1kPoints: integer("rate_cents_per_1k_points"),
    /** partner_pool: the last payout period that accrued into this wallet. */
    lastPeriodId: uuid("last_period_id"),
    /** phone_cents: auto top-up config (NULL for other currencies). */
    autoTopUpEnabled: boolean("auto_top_up_enabled"),
    autoTopUpThreshold: integer("auto_top_up_threshold"),
    autoTopUpAmount: integer("auto_top_up_amount"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("uq_wallet_balances_owner_currency").on(t.ownerKind, t.ownerId, t.currencyKind),
    // Leaderboards / stats scan one currency.
    index("idx_wallet_balances_currency").on(t.currencyKind),
    index("idx_wallet_balances_suspended").on(t.isSuspended).where(sql`"is_suspended" = true`),
    index("idx_wallet_balances_suspended_by").on(t.suspendedBy),
    check("wallet_balances_owner_kind_check", sql`${t.ownerKind} IN ('user', 'company')`),
    check(
      "wallet_balances_currency_kind_check",
      sql`${t.currencyKind} IN ('ai_tokens', 'enrichment_credits', 'campaign_dollars', 'partner_pool', 'points', 'phone_cents')`,
    ),
  ],
);

export type WalletBalance = typeof walletBalances.$inferSelect;
export type NewWalletBalance = typeof walletBalances.$inferInsert;

export const walletLedger = pgTable(
  "wallet_ledger",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerKind: varchar("owner_kind", { length: 16 }).notNull(),
    ownerId: uuid("owner_id").notNull(),
    currencyKind: varchar("currency_kind", { length: 24 }).notNull(),
    /** Entry type — shared/wallets.ts WALLET_LEDGER_TYPES_BY_CURRENCY. */
    type: varchar("type", { length: 32 }).notNull(),
    /** Signed: positive = credit, negative = debit. */
    amount: integer("amount").notNull(),
    /** Balance right after this entry. NULL for points (whose balance is
     *  clamped at 0 and never recorded per entry). */
    balanceAfter: integer("balance_after"),
    referenceType: varchar("reference_type", { length: 40 }),
    /** Id of the originating entity (redemption, checkout, contact, call,
     *  task row …). Text so non-uuid refs fit. */
    referenceId: text("reference_id"),
    description: text("description"),
    // ── points event columns (NULL for every other currency) ──
    /** Points catalog action key, e.g. "task.complete.system". */
    action: varchar("action", { length: 80 }),
    /** Where the points event originated. */
    source: varchar("source", { length: 40 }),
    /** For a reversal row: the earn row it reverses. */
    reversesId: uuid("reverses_id"),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("idx_wallet_ledger_owner_created").on(
      t.ownerKind,
      t.ownerId,
      t.currencyKind,
      t.createdAt.desc().nullsFirst(),
    ),
    index("idx_wallet_ledger_reference").on(t.referenceType, t.referenceId),
    index("idx_wallet_ledger_action").on(t.action).where(sql`"action" IS NOT NULL`),
    // Points award idempotency (was points_ledger_dedup_uniq): at most one row
    // per (user, action, ref, category) when the ref is set.
    uniqueIndex("uq_wallet_ledger_points_dedup")
      .on(t.ownerId, t.action, t.referenceId, t.type)
      .where(sql`"currency_kind" = 'points' AND "reference_id" IS NOT NULL`),
    check("wallet_ledger_owner_kind_check", sql`${t.ownerKind} IN ('user', 'company')`),
    check(
      "wallet_ledger_currency_kind_check",
      sql`${t.currencyKind} IN ('ai_tokens', 'enrichment_credits', 'campaign_dollars', 'partner_pool', 'points', 'phone_cents')`,
    ),
    check(
      "wallet_ledger_type_check",
      sql`${t.type} IN ('purchase', 'deduction', 'refund', 'monthly_grant', 'grant_redemption', 'boost_spend', 'ad_spend', 'call_charge', 'sms_charge', 'earn', 'redeem', 'adjust', 'reverse', 'streak_bonus', 'badge_bonus')`,
    ),
  ],
);

export type WalletLedgerEntry = typeof walletLedger.$inferSelect;
export type NewWalletLedgerEntry = typeof walletLedger.$inferInsert;
