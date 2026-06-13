/**
 * inbox_actions + inbox_action_runs — the L2 action engine for role-aware
 * inbox processors (#1981).
 *
 * Kept SEPARATE from the L1 classifier (classify.ts) by design: L1 decides
 * what a message is + pulls structured fields; L2 decides what to DO about
 * it in another aggregate. An action is `(trigger) → handler`:
 *   • inbox_actions     — per-profile config (trigger + handler + params)
 *   • inbox_action_runs — append-only audit, idempotent on
 *                         (message_id, action_id) so re-sync never double-fires
 *
 * Trigger/handler/status vocabularies live in
 * shared/email-classification/actions.ts (CHECK constraints mirror them).
 */

import {
  pgTable,
  uuid,
  text,
  varchar,
  boolean,
  timestamp,
  jsonb,
  integer,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { users } from "./users.js";
import { inboxProfiles, externalEmailMessages } from "./externalEmail.js";

export const inboxActions = pgTable(
  "inbox_actions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    profileId: uuid("profile_id")
      .notNull()
      .references(() => inboxProfiles.id, { onDelete: "cascade" }),
    /** Owner of this action. NULL for preset-bundled actions (system);
     *  set for user-authored actions on a cloned profile. */
    ownerId: uuid("owner_id").references(() => users.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 120 }).notNull(),
    /** category | rule | always — see INBOX_ACTION_TRIGGERS. */
    triggerType: varchar("trigger_type", { length: 24 }).notNull(),
    /** Category key or rule name the trigger keys on (NULL for `always`). */
    triggerValue: varchar("trigger_value", { length: 120 }),
    /** notify | upsert_contact | link_to_pipeline | … — see INBOX_ACTION_HANDLERS. */
    handler: varchar("handler", { length: 32 }).notNull(),
    /** Handler-specific params (webhook url, notify title template, …). */
    config: jsonb("config"),
    isEnabled: boolean("is_enabled").default(true).notNull(),
    priority: integer("priority").default(100).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    profileEnabledIdx: index("inbox_actions_profile_enabled_idx").on(
      t.profileId,
      t.isEnabled,
      t.priority,
    ),
    ownerIdx: index("inbox_actions_owner_idx").on(t.ownerId),
  }),
);

export type InboxAction = typeof inboxActions.$inferSelect;
export type NewInboxAction = typeof inboxActions.$inferInsert;

export const inboxActionRuns = pgTable(
  "inbox_action_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    messageId: uuid("message_id")
      .notNull()
      .references(() => externalEmailMessages.id, { onDelete: "cascade" }),
    actionId: uuid("action_id")
      .notNull()
      .references(() => inboxActions.id, { onDelete: "cascade" }),
    /** Snapshot of the profile that owned the action at run time (audit
     *  survives a profile delete). */
    profileId: uuid("profile_id").references(() => inboxProfiles.id, { onDelete: "set null" }),
    handler: varchar("handler", { length: 32 }).notNull(),
    /** success | error | skipped — see INBOX_ACTION_RUN_STATUSES. */
    status: varchar("status", { length: 16 }).notNull(),
    /** What the handler touched (contact / job / sourcing_lead / notification). */
    targetType: varchar("target_type", { length: 32 }),
    targetId: uuid("target_id"),
    /** Human-readable summary or error message. */
    detail: text("detail"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    // Idempotency — one run per (message, action). The dispatcher inserts
    // ON CONFLICT DO NOTHING so a re-sync never double-fires a handler.
    messageActionUnq: uniqueIndex("inbox_action_runs_message_action_key").on(
      t.messageId,
      t.actionId,
    ),
    userCreatedIdx: index("inbox_action_runs_user_created_idx").on(t.userId, t.createdAt),
    messageIdx: index("inbox_action_runs_message_idx").on(t.messageId),
  }),
);

export type InboxActionRun = typeof inboxActionRuns.$inferSelect;
export type NewInboxActionRun = typeof inboxActionRuns.$inferInsert;
