/**
 * external_email — synced inbox sources (Gmail, Outlook, …).
 *
 * Two tables make up this aggregate:
 *   • externalEmailAccounts  — one row per connected mailbox per user
 *   • externalEmailMessages  — synced messages, classified, scored, optionally linked to jobs
 *
 * The read-side aggregator (services/messaging/inboxService.ts) merges the
 * latest non-archived externalEmailMessages into the Communication Hub feed
 * alongside conversations, notifications, and connection requests.
 *
 * Classifier/scoring/summary/linkedJobId fields stay nullable so the foundation
 * ships ahead of the email-integration, classifier, and dedup phases without
 * forcing an empty backfill.
 */

import {
  pgTable,
  uuid,
  text,
  varchar,
  boolean,
  timestamp,
  jsonb,
  numeric,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";
import { users } from "./users.js";
import { jobItems } from "./jobs.js";

export const externalEmailAccounts = pgTable(
  "external_email_accounts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    provider: varchar("provider", { length: 16 }).notNull(),
    accountEmail: varchar("account_email", { length: 320 }).notNull(),
    accountLabel: varchar("account_label", { length: 120 }),
    oauthRefreshTokenEnc: text("oauth_refresh_token_enc"),
    pushSubscriptionId: varchar("push_subscription_id", { length: 255 }),
    pushExpiresAt: timestamp("push_expires_at", { withTimezone: true }),
    lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
    status: varchar("status", { length: 16 }).default("active").notNull(),
    lastError: text("last_error"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    userProviderEmailUnq: uniqueIndex("external_email_accounts_user_provider_email_key").on(
      t.userId,
      t.provider,
      t.accountEmail,
    ),
    userStatusIdx: index("external_email_accounts_user_status_idx").on(t.userId, t.status),
  }),
);

export type ExternalEmailAccount = typeof externalEmailAccounts.$inferSelect;
export type NewExternalEmailAccount = typeof externalEmailAccounts.$inferInsert;

export const externalEmailMessages = pgTable(
  "external_email_messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    accountId: uuid("account_id")
      .notNull()
      .references(() => externalEmailAccounts.id, { onDelete: "cascade" }),
    provider: varchar("provider", { length: 16 }).notNull(),
    providerMessageId: varchar("provider_message_id", { length: 255 }).notNull(),
    providerThreadId: varchar("provider_thread_id", { length: 255 }),

    fromEmail: varchar("from_email", { length: 320 }).notNull(),
    fromName: varchar("from_name", { length: 255 }),
    subject: text("subject"),
    snippet: text("snippet"),
    bodyHtml: text("body_html"),
    bodyText: text("body_text"),
    receivedAt: timestamp("received_at", { withTimezone: true }).notNull(),

    category: varchar("category", { length: 40 }),
    score: numeric("score", { precision: 4, scale: 3 }),
    summary: text("summary"),

    linkedJobId: uuid("linked_job_id").references(() => jobItems.id, { onDelete: "set null" }),

    isRead: boolean("is_read").default(false).notNull(),
    isArchived: boolean("is_archived").default(false).notNull(),
    rawMetadata: jsonb("raw_metadata"),

    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    accountMessageUnq: uniqueIndex("external_email_messages_account_message_key").on(
      t.accountId,
      t.providerMessageId,
    ),
    userInboxIdx: index("external_email_messages_user_inbox_idx").on(
      t.userId,
      t.isArchived,
      t.receivedAt,
    ),
    accountReceivedIdx: index("external_email_messages_account_received_idx").on(
      t.accountId,
      t.receivedAt,
    ),
  }),
);

export type ExternalEmailMessage = typeof externalEmailMessages.$inferSelect;
export type NewExternalEmailMessage = typeof externalEmailMessages.$inferInsert;
