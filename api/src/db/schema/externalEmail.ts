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
  check,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { users } from "./users.js";
import { jobItems } from "./jobs.js";
import { providerConnections } from "./providerConnections.js";

/**
 * inbox_profiles — the role-keyed unit that generalises the hardwired
 * job-seeker classifier into a first-class aggregate (role-aware inbox
 * processors, #1979). System presets (`is_preset = true`,
 * `owner_id = NULL`) are seeded by migration 0206/0207 and mirror
 * `shared/email-classification/presets.ts`; user clones are owner-scoped.
 *
 * A profile drives the L1 processor end-to-end:
 *   • `taxonomy`         — Category[]; the inbox-visibility SSoT (replaces
 *     the hardcoded `JOB_INBOX_CATEGORIES`).
 *   • `classify_prompt`  — Stage-2 system prompt (replaces `CLASSIFY_PROMPT`).
 *   • `summary_prompt`   — Stage-2 summariser prompt.
 *   • `extract_schema`   — JSON-Schema-ish fields the Stage-2 prompt pulls
 *     into `external_email_messages.extracted`.
 *   • `default_rule_set` — which code-pinned Stage-1 rule set runs.
 *   • `min_relevance_score` — profile-level confidence floor (the per-account
 *     `min_relevance_score` overrides it).
 *   • `version` — bumped on edit; cache key + rules-compile invalidation.
 */
export const inboxProfiles = pgTable(
  "inbox_profiles",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** NULL for seeded system presets; set for user clones. */
    ownerId: uuid("owner_id").references(() => users.id, { onDelete: "cascade" }),
    /** UserRole[] this profile is offered to. */
    roles: jsonb("roles").default([]).notNull(),
    name: varchar("name", { length: 120 }).notNull(),
    description: text("description"),
    isPreset: boolean("is_preset").default(false).notNull(),
    /** Stable key for a seeded preset (job_hunter, recruiter_sourcing, …);
     *  NULL for clones. */
    presetKey: varchar("preset_key", { length: 64 }),
    /** Category[] incl. the universal noise buckets. */
    taxonomy: jsonb("taxonomy").notNull(),
    classifyPrompt: text("classify_prompt").notNull(),
    summaryPrompt: text("summary_prompt"),
    extractSchema: jsonb("extract_schema"),
    defaultRuleSet: varchar("default_rule_set", { length: 32 }),
    minRelevanceScore: numeric("min_relevance_score", { precision: 4, scale: 3 })
      .default("0.500")
      .notNull(),
    version: integer("version").default(1).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    ownerIdx: index("inbox_profiles_owner_idx").on(t.ownerId),
    presetKeyUnq: uniqueIndex("inbox_profiles_preset_key_key").on(t.presetKey),
  }),
);

export type InboxProfile = typeof inboxProfiles.$inferSelect;
export type NewInboxProfile = typeof inboxProfiles.$inferInsert;

// Connected mailboxes live in provider_connections (purpose "email_inbox",
// W3-C migration 0600); ids were kept, so external_email_messages.account_id
// and email_sync_runs.account_id still point at the same row.

export const externalEmailMessages = pgTable(
  "external_email_messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    accountId: uuid("account_id")
      .notNull()
      .references(() => providerConnections.id, { onDelete: "cascade" }),
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

    /** L1 structured fields the Stage-2 prompt pulled out, shaped by the
     *  active profile's `extract_schema` (recruiter presets — role,
     *  company, candidateRef, …). NULL for Job Hunter (no extraction). */
    extracted: jsonb("extracted"),
    /** Computed at ingest from `isVisibleCategory(category, profile)` —
     *  whether this message's category reaches the inbox feed under the
     *  account's active profile. Decouples the read query from the
     *  hardcoded `JOB_INBOX_CATEGORIES` list so recruiter taxonomies show
     *  the right mail. The per-account score floor is still applied LIVE
     *  in the read query so the Settings slider keeps re-filtering. */
    isRelevant: boolean("is_relevant").default(false).notNull(),

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
    // #1612 — canonical soft-delete timestamp, added in 0154.
    archivedAt: timestamp("archived_at", { withTimezone: true }),
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
    externalEmailMessagesLinkedJobIdx: index("external_email_messages_linked_job_idx").on(t.linkedJobId).where(sql`linked_job_id IS NOT NULL`),
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
    /** The profile this rule belongs to. NULL = legacy global rule,
     *  applied to the user's Job Hunter (job-seeker) profile so existing
     *  rows keep firing unchanged. */
    profileId: uuid("profile_id").references(() => inboxProfiles.id, { onDelete: "cascade" }),
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
    profileIdFkIdx: index("idx_email_user_rules_profile_id").on(t.profileId),
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
      .references(() => providerConnections.id, { onDelete: "cascade" }),
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
     *  personal / other) or below the per-account `minRelevanceScore` floor.
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
    // #2305 — legacy UNIQUE (migration 0095_email_sync_runs_session_id.sql); duplicates resolved by 0518_dedupe_unique_indexes.sql.
    sessionUnq: uniqueIndex("email_sync_runs_session_unq")
      .on(t.accountId, t.syncSessionId)
      .where(sql`sync_session_id IS NOT NULL`),
  }),
);

export type EmailSyncRun = typeof emailSyncRuns.$inferSelect;
export type NewEmailSyncRun = typeof emailSyncRuns.$inferInsert;
