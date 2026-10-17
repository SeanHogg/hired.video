/**
 * Vendor Sync — drizzle schema for `profile_sync_runs`.
 *
 * Audit log for read/write between hired.video's master resume + variants
 * and external profile vendors (LinkedIn, Indeed, Glassdoor, GitHub, ...).
 * See migration 0079_profile_sync_runs.sql for column rationale.
 *
 * The connector registry itself lives in code (services/sync/connectors/),
 * not in this table — adding a vendor never requires a migration.
 */

import {
  pgTable, uuid, text, varchar, timestamp, jsonb, index,
} from "drizzle-orm/pg-core";
import { users } from "./users.js";
import { resumeInformation } from "./resumes.js";

export const profileSyncRuns = pgTable("profile_sync_runs", {
  id:                 uuid("id").primaryKey().defaultRandom(),
  userId:             uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  connectorId:        varchar("connector_id", { length: 64 }).notNull(),
  direction:          varchar("direction", { length: 16 }).notNull(),
  status:             varchar("status", { length: 16 }).notNull().default("pending"),

  // import → master that received the merge; export → variant that was rendered.
  // Both nullable; `set null` on resume delete preserves the audit row for
  // outcome attribution after the resume itself is gone.
  targetResumeId:     uuid("target_resume_id").references(() => resumeInformation.id, { onDelete: "set null" }),
  sourceResumeId:     uuid("source_resume_id").references(() => resumeInformation.id, { onDelete: "set null" }),

  sourceUrl:          text("source_url"),
  analysisSnapshot:   jsonb("analysis_snapshot"),
  decisionsSnapshot:  jsonb("decisions_snapshot"),
  resultSnapshot:     jsonb("result_snapshot"),
  notes:              text("notes"),
  errorMessage:       text("error_message"),

  startedAt:          timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  completedAt:        timestamp("completed_at", { withTimezone: true }),
  manualMarkedAt:     timestamp("manual_marked_at", { withTimezone: true }),
}, (t) => [
  index("profile_sync_runs_user_started_idx").on(t.userId, t.startedAt),
  index("profile_sync_runs_user_connector_idx").on(t.userId, t.connectorId, t.startedAt),
  index("profile_sync_runs_source_resume_idx").on(t.sourceResumeId),
  index("idx_profile_sync_runs_target_resume_id").on(t.targetResumeId),
]);

export type ProfileSyncRun = typeof profileSyncRuns.$inferSelect;
export type NewProfileSyncRun = typeof profileSyncRuns.$inferInsert;
