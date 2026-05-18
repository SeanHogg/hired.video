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
  integer,
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
    /** Gmail `users.history.list` cursor — historyId from the most recent
     *  successful sync. Null until the first run completes. */
    lastHistoryId: varchar("last_history_id", { length: 64 }),
    /** Outlook Graph `/me/messages/delta` link. Null until first run. */
    lastDeltaLink: text("last_delta_link"),
    /** Granted OAuth scopes — denormalised so we can detect partial
     *  consent (e.g. user dropped read scope in Google account settings). */
    scopes: jsonb("scopes"),
    status: varchar("status", { length: 16 }).default("active").notNull(),
    lastError: text("last_error"),
    /** Per-account confidence floor — only messages classified at or
     *  above this score reach the inbox feed. Defaults to 0.5 so newly
     *  connected mailboxes get a sensible "job mail only" cut without
     *  user setup. */
    minJobScore: numeric("min_job_score", { precision: 4, scale: 3 }).default("0.500").notNull(),
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

    /** Discovered apply URL extracted from the body — used by the dedup
     *  + auto-create flow (P3) when no existing job_items row matches.
     *  Holds the FIRST extracted URL only; the full list lives in
     *  `applyUrls` jsonb below. Kept as a scalar so dedup + auto-create
     *  (single-job-per-email) don't need to change shape. */
    applyUrl: text("apply_url"),
    /** Every recognised apply/jobs/careers/ATS URL the body contained,
     *  with anchor text when present. Powers the multi-Apply CTA list
     *  on digest emails (LinkedIn Job Alerts, Indeed weekly, Wellfound
     *  newsletters) that promote N roles in one message. Shape:
     *  `Array<{ url: string; label: string | null }>`. */
    applyUrls: jsonb("apply_urls"),
    /** Confidence of the dedup match against an existing job_items row.
     *  Distinct from the classifier `score`. */
    dedupScore: numeric("dedup_score", { precision: 4, scale: 3 }),
    /** Which dedup strategy produced `linkedJobId`. */
    dedupMethod: varchar("dedup_method", { length: 32 }),

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

/**
 * Per-user classification rules. Stage-1 evaluator walks the user's
 * enabled rules in priority order; the first match emits the rule's
 * `(actionCategory, actionScore)` and skips the LLM stage entirely.
 *
 * The default ATS-domain ruleset lives in code (services/email-integration/
 * default-rules.ts) and runs after user rules — this table only holds
 * user-authored overrides.
 */
export const emailUserRules = pgTable(
  "email_user_rules",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 120 }).notNull(),
    conditions: jsonb("conditions").default([]).notNull(),
    actionCategory: varchar("action_category", { length: 40 }).notNull(),
    actionScore: numeric("action_score", { precision: 4, scale: 3 }).default("1").notNull(),
    isEnabled: boolean("is_enabled").default(true).notNull(),
    priority: integer("priority").default(100).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    userPriorityIdx: index("email_user_rules_user_priority_idx").on(
      t.userId,
      t.isEnabled,
      t.priority,
    ),
  }),
);

export type EmailUserRule = typeof emailUserRules.$inferSelect;
export type NewEmailUserRule = typeof emailUserRules.$inferInsert;

/**
 * Per-account sync run audit + digest source. One row per **logical
 * sync** (one click of "Sync now", one cron firing, one Service-Worker
 * `periodicSync` wake). The PWA orchestrator splits a logical sync
 * into N chunked POSTs to `/inbox/external-emails/ingest` and stamps
 * every chunk with the same `sync_session_id`; the ingest service
 * upserts this row on that key, summing counters across chunks. The
 * unique partial index on `(account_id, sync_session_id)` is what
 * makes the upsert atomic (gap #811, migration 0095).
 */
export const emailSyncRuns = pgTable(
  "email_sync_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    accountId: uuid("account_id")
      .notNull()
      .references(() => externalEmailAccounts.id, { onDelete: "cascade" }),
    /** Client-generated UUID stamped on every chunk POST of a single
     *  logical sync. Nullable to keep pre-migration-0095 rows valid;
     *  new rows always carry one. */
    syncSessionId: varchar("sync_session_id", { length: 64 }),
    startedAt: timestamp("started_at", { withTimezone: true }).defaultNow().notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    status: varchar("status", { length: 16 }).default("running").notNull(),
    messagesSynced: integer("messages_synced").default(0).notNull(),
    messagesClassified: integer("messages_classified").default(0).notNull(),
    /** Messages classified to a non-job category (newsletter / spam /
     *  personal / other) or below the per-account `minJobScore` floor.
     *  Surfaced in the Sync History sheet as the "excluded" count so
     *  users see what the filter held back. */
    messagesExcluded: integer("messages_excluded").default(0).notNull(),
    /** Messages classified into a job-related category at or above the
     *  per-account floor — i.e. messages that reached the inbox feed. */
    messagesJobRelated: integer("messages_job_related").default(0).notNull(),
    jobsLinked: integer("jobs_linked").default(0).notNull(),
    jobsCreated: integer("jobs_created").default(0).notNull(),
    /** Counter map { ruleName: count } of Stage-1 deterministic rules
     *  that fired during the run. Powers the "Rules applied" section
     *  in the Sync History sheet so the user can audit why messages
     *  were tagged the way they were. */
    rulesFired: jsonb("rules_fired"),
    digestSummary: text("digest_summary"),
    errorMessage: text("error_message"),
  },
  (t) => ({
    userStartedIdx: index("email_sync_runs_user_started_idx").on(t.userId, t.startedAt),
    accountStartedIdx: index("email_sync_runs_account_started_idx").on(t.accountId, t.startedAt),
  }),
);

export type EmailSyncRun = typeof emailSyncRuns.$inferSelect;
export type NewEmailSyncRun = typeof emailSyncRuns.$inferInsert;
