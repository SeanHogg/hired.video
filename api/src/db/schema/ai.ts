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
} from "drizzle-orm/pg-core";
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
});

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
  ],
);

export type AiChatMessage = typeof aiChatMessages.$inferSelect;
export type NewAiChatMessage = typeof aiChatMessages.$inferInsert;

export const aiUsageRecords = pgTable("ai_usage_records", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  model: varchar("model", { length: 100 }).notNull(),
  featureKey: varchar("feature_key", { length: 100 }).notNull(),
  promptTokens: integer("prompt_tokens").default(0).notNull(),
  completionTokens: integer("completion_tokens").default(0).notNull(),
  totalTokens: integer("total_tokens").default(0).notNull(),
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
});

export type AiUsageRecord = typeof aiUsageRecords.$inferSelect;
export type NewAiUsageRecord = typeof aiUsageRecords.$inferInsert;

/**
 * Per-user purchased token balance. Separate from the monthly subscription
 * allowance — these tokens come from one-off pack purchases (TOKEN_PACKS)
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
  /** Stripe payment intent id for reconciliation / refunds. */
  stripePaymentIntentId: varchar("stripe_payment_intent_id", { length: 100 }),
  status: varchar("status", { length: 20 }).default("paid").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export type TokenPackPurchase = typeof tokenPackPurchases.$inferSelect;
export type NewTokenPackPurchase = typeof tokenPackPurchases.$inferInsert;
