import {
  pgTable,
  uuid,
  text,
  varchar,
  boolean,
  timestamp,
  jsonb,
  integer,
  numeric,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { users } from "./users.js";
import { toolRuns } from "./tool-runs.js";

export const aiChatSessions = pgTable("ai_chat_sessions", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  title: varchar("title", { length: 500 }),
  model: varchar("model", { length: 100 }),
  systemPrompt: text("system_prompt"),
  isActive: boolean("is_active").default(true).notNull(),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index("idx_ai_chat_sessions_user_active_updated").on(t.userId, t.updatedAt.desc().nullsFirst()).where(sql`is_active = true`),
]);

export type AiChatSession = typeof aiChatSessions.$inferSelect;
export type NewAiChatSession = typeof aiChatSessions.$inferInsert;

export const aiChatMessages = pgTable(
  "ai_chat_messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sessionId: uuid("session_id").notNull().references(() => aiChatSessions.id, { onDelete: "cascade" }),
    role: varchar("role", { length: 20 }).notNull(),
    content: text("content").notNull(),
    tokensUsed: integer("tokens_used"),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    // Session render is a paged read by (session_id, created_at).
    index("idx_ai_chat_messages_session_created").on(t.sessionId, t.createdAt),
    // Retention sweep range scan (0495).
    index("idx_ai_chat_messages_created").on(t.createdAt),
  ],
);

export type AiChatMessage = typeof aiChatMessages.$inferSelect;
export type NewAiChatMessage = typeof aiChatMessages.$inferInsert;

export const aiUsageRecords = pgTable("ai_usage_records", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  // Workspace this call was billed against (gap #1679). Set when an active
  // workforce employee draws from their employer's shared token pool; null
  // for personal/per-user consumption. Drives both the company-pool monthly
  // total AND the per-member sub-cap accounting. FK added in migration 0172.
  companyId: uuid("company_id"),
  model: varchar("model", { length: 100 }).notNull(),
  featureKey: varchar("feature_key", { length: 100 }).notNull(),
  promptTokens: integer("prompt_tokens").default(0).notNull(),
  completionTokens: integer("completion_tokens").default(0).notNull(),
  totalTokens: integer("total_tokens").default(0).notNull(),
  /** Vendor cost of the call in USD, priced from shared/ai-model-rates.ts
   *  at charge time (migration 0501 backfilled historical rows). */
  cost: numeric("cost").default("0").notNull(),
  /** Where the tokens were debited from: "monthly" (free or pro included)
   *  or "pack" (purchased token-pack balance). Used for analytics. */
  source: varchar("source", { length: 20 }).default("monthly").notNull(),
  sessionId: uuid("session_id").references(() => aiChatSessions.id, { onDelete: "set null" }),
  /** Cross-link to the `tool_runs` row this charge belongs to (when the
   *  caller was a tool invocation). Null for non-tool AI calls
   *  (chat, autofill, dashboard insights, etc.). Admin "tokens-by-tool"
   *  analytics joins on this FK so the old string-match on featureKey
   *  can retire. */
  toolRunId: uuid("tool_run_id").references(() => toolRuns.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index("ai_usage_records_tool_run_id_idx").on(t.toolRunId),
  index("idx_ai_usage_records_user_created").on(t.userId, t.createdAt.desc().nullsFirst()),
  index("idx_ai_usage_records_company").on(t.companyId, t.userId, t.createdAt),
]);

export type AiUsageRecord = typeof aiUsageRecords.$inferSelect;
export type NewAiUsageRecord = typeof aiUsageRecords.$inferInsert;

/**
 * Per-user purchased token balance. Separate from the monthly subscription
 * allowance — these tokens come from one-off pack purchases (TOKEN_PACKS)
 * or SuperAdmin grants
 * and never expire. Decremented after each AI call once the user's monthly
 * allowance has been exhausted. One row per user (enforced via unique
 * constraint on user_id, not via primary key, because Drizzle's type
 * inference misbehaves when a column is both PK and a FK reference).
 */
export const userTokenBalance = pgTable("user_token_balance", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .unique()
    .references(() => users.id, { onDelete: "cascade" }),
  /** Total tokens currently available from all unexpired pack purchases. */
  balance: integer("balance").default(0).notNull(),
  /** Lifetime tokens ever granted via pack purchases (audit / analytics). */
  lifetimeGranted: integer("lifetime_granted").default(0).notNull(),
  /** Lifetime tokens ever consumed from the pack balance. */
  lifetimeConsumed: integer("lifetime_consumed").default(0).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export type UserTokenBalance = typeof userTokenBalance.$inferSelect;
export type NewUserTokenBalance = typeof userTokenBalance.$inferInsert;

/**
 * Per-COMPANY purchased token pool (gap #1679). The workspace analog of
 * userTokenBalance: top-up tokens an employer buys that all members draw
 * from once the monthly seat-derived allowance is exhausted. One row per
 * company. (The purchase/top-up flow itself is tracked separately — see the
 * gap register; today the balance is only debited, seeded by future top-ups.)
 */
export const companyTokenBalance = pgTable("company_token_balance", {
  id: uuid("id").primaryKey().defaultRandom(),
  companyId: uuid("company_id").notNull().unique(),
  balance: integer("balance").default(0).notNull(),
  lifetimeGranted: integer("lifetime_granted").default(0).notNull(),
  lifetimeConsumed: integer("lifetime_consumed").default(0).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export type CompanyTokenBalance = typeof companyTokenBalance.$inferSelect;
export type NewCompanyTokenBalance = typeof companyTokenBalance.$inferInsert;

/**
 * Audit log of token-pack purchases. One row per Stripe charge. Pack
 * top-ups are reflected in `userTokenBalance.balance`; this table is the
 * historical record (refunds, support questions, accounting).
 */
export const tokenPackPurchases = pgTable("token_pack_purchases", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  /** SKU id from shared/pricing.ts:TOKEN_PACKS, e.g. "tokens_standard_2m". */
  packId: varchar("pack_id", { length: 50 }).notNull(),
  tokensGranted: integer("tokens_granted").notNull(),
  /** Price paid in USD (decimal). */
  pricePaid: numeric("price_paid").notNull(),
  currency: varchar("currency", { length: 3 }).default("USD").notNull(),
  /** Payment-provider transaction id (Helcim card transaction / Stripe
   *  payment intent — the column name predates Helcim). Unique when set, so
   *  one charge can only ever credit one pack (migration 0501, gap #2200).
   *  Null for SuperAdmin grants. */
  stripePaymentIntentId: varchar("stripe_payment_intent_id", { length: 100 }),
  /** pending → paid | rejected | expired (refunded set by ops). A charge is
   *  recorded `pending` before the provider check and credited exactly once
   *  on the pending → paid flip (migration 0517, gap #2352). */
  status: varchar("status", { length: 20 }).default("paid").notNull(),
  /** Provider checks made for a pending row; the reconcile cron expires the
   *  row after TOKEN_PACK_MAX_CHECKS. */
  checkAttempts: integer("check_attempts").default(0).notNull(),
  /** Last provider check (null = never) — the cron re-checks the stalest. */
  checkedAt: timestamp("checked_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index("token_pack_purchases_user_id_idx").on(t.userId),
  uniqueIndex("uq_token_pack_purchases_payment_ref")
    .on(t.stripePaymentIntentId)
    .where(sql`stripe_payment_intent_id IS NOT NULL`),
  index("idx_token_pack_purchases_pending")
    .on(t.checkedAt.asc().nullsFirst(), t.createdAt)
    .where(sql`status = 'pending'`),
]);

export type TokenPackPurchase = typeof tokenPackPurchases.$inferSelect;
export type NewTokenPackPurchase = typeof tokenPackPurchases.$inferInsert;
