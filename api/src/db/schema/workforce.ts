/**
 * Workforce / agency back-office aggregate (#1349 Phase 1+2).
 *
 * Two tables:
 *   - task_time_entries: append-per-punch log. One row per
 *     punch-in/out cycle. An "active" entry is the unique row with
 *     ended_at = NULL for a given user.
 *   - timesheets: weekly submission envelope. Snapshots the entries
 *     under it at submit time and tracks the approval state machine.
 *
 * Audit trail for state transitions (submit / approve / reject) is
 * deliberately NOT a per-aggregate copy of pipelineTouchpoints — it
 * rides the shared audit_touchpoints backbone tracked under #1404.
 * Until #1404 lands, Phase 2 logs to a local touchpoint table; this
 * file will gain an `entityType='timesheet'` filter once #1404 ships.
 */

import {
  pgTable,
  uuid,
  varchar,
  text,
  boolean,
  timestamp,
  jsonb,
  integer,
  numeric,
  date,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { users } from "./users.js";
import { tasks } from "./productivity.js";
import { companyProfiles } from "./companies.js";

// ---------------------------------------------------------------------------
// Phase 1 — task_time_entries
// ---------------------------------------------------------------------------

export const taskTimeEntries = pgTable("task_time_entries", {
  id: uuid("id").primaryKey().defaultRandom(),
  // The task being worked. Nullable so an employee can log "general"
  // time that isn't pinned to a specific task (e.g. on-call standby);
  // most punches will have it set.
  taskId: uuid("task_id").references(() => tasks.id, { onDelete: "set null" }),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  // Denormalised for fast tenant filter — same companyId as the
  // userCompanyRoleAssociations row for this employee.
  companyId: uuid("company_id").notNull().references(() => companyProfiles.id, { onDelete: "cascade" }),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
  // Null = currently punched in. There must be at most one open row
  // per user, but Postgres can't express "at most one NULL" as a
  // unique constraint, so the service guards the invariant.
  endedAt: timestamp("ended_at", { withTimezone: true }),
  // Closed-form duration computed at punch-out. Lets the week-aggregator
  // SUM without timezone arithmetic.
  durationSec: integer("duration_sec"),
  billable: boolean("billable").default(true).notNull(),
  notes: text("notes"),
  // open | closed | submitted | approved | rejected
  // submitted / approved / rejected mirror the parent timesheet.
  status: varchar("status", { length: 16 }).default("open").notNull(),
  // Set when a timesheet is created for the period this entry belongs to.
  // Locked — once on a timesheet, an entry can no longer be edited unless
  // the timesheet is rejected back to draft.
  timesheetId: uuid("timesheet_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index("idx_time_entries_user_started").on(t.userId, t.startedAt),
  index("idx_time_entries_company_started").on(t.companyId, t.startedAt),
  index("idx_time_entries_timesheet").on(t.timesheetId),
  // Find the open row for a user fast. WHERE-partial means the index
  // only stores rows that are actually punched-in (typically << 1% of total).
  index("idx_time_entries_active").on(t.userId).where(sql`ended_at IS NULL`),
  index("idx_task_time_entries_task_id").on(t.taskId),
]);

export type TaskTimeEntry = typeof taskTimeEntries.$inferSelect;
export type NewTaskTimeEntry = typeof taskTimeEntries.$inferInsert;

// ---------------------------------------------------------------------------
// Phase 2 — timesheets (weekly submission envelope)
// ---------------------------------------------------------------------------

export const timesheets = pgTable("timesheets", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  companyId: uuid("company_id").notNull().references(() => companyProfiles.id, { onDelete: "cascade" }),
  // Monday of the week. `periodEnd` is denormalised but lets read queries
  // avoid date math when filtering by range.
  periodStart: date("period_start").notNull(),
  periodEnd: date("period_end").notNull(),
  // draft | submitted | approved | rejected
  status: varchar("status", { length: 16 }).default("draft").notNull(),
  submittedAt: timestamp("submitted_at", { withTimezone: true }),
  approvedAt: timestamp("approved_at", { withTimezone: true }),
  approverId: uuid("approver_id").references(() => users.id, { onDelete: "set null" }),
  rejectionReason: text("rejection_reason"),
  // SUM of durationSec / 3600 for entries in this period, computed at
  // submit time so the approver sees stable totals even if the underlying
  // entries get edited (which they shouldn't — but defence in depth).
  totalHours: numeric("total_hours", { precision: 7, scale: 2 }),
  totalBillableHours: numeric("total_billable_hours", { precision: 7, scale: 2 }),
  // Frozen entries at submit time. The approver renders from this, not
  // a live query of task_time_entries, so the same snapshot can be
  // signed / replayed for audit / shipped to QBO / Xero later (Phase 3).
  snapshot: jsonb("snapshot"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  // One timesheet per employee per company per week. Re-submission of
  // a rejected week resets status on the existing row.
  uniqueIndex("uniq_timesheet_user_company_period").on(t.userId, t.companyId, t.periodStart),
  index("idx_timesheets_company_status").on(t.companyId, t.status),
  index("idx_timesheets_user_status").on(t.userId, t.status),
  index("idx_timesheets_approver_id").on(t.approverId),
]);

export type Timesheet = typeof timesheets.$inferSelect;
export type NewTimesheet = typeof timesheets.$inferInsert;

// ---------------------------------------------------------------------------
// Phase 2 — timesheet_touchpoints (audit trail).
//
// Lives here as a per-aggregate copy of the pipelineTouchpoints pattern
// until #1404 (shared audit_touchpoints) lands. When that ships, this
// table will be migrated into the polymorphic shared table.
// ---------------------------------------------------------------------------

export const timesheetTouchpoints = pgTable("timesheet_touchpoints", {
  id: uuid("id").primaryKey().defaultRandom(),
  timesheetId: uuid("timesheet_id").notNull().references(() => timesheets.id, { onDelete: "cascade" }),
  // submitted | approved | rejected | reopened | note
  type: varchar("type", { length: 32 }).notNull(),
  payload: jsonb("payload").default({}),
  performedByUserId: uuid("performed_by_user_id").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index("idx_timesheet_touchpoints_ts_created").on(t.timesheetId, t.createdAt),
  index("idx_timesheet_touchpoints_performed_by_user_id").on(t.performedByUserId),
]);

export type TimesheetTouchpoint = typeof timesheetTouchpoints.$inferSelect;
export type NewTimesheetTouchpoint = typeof timesheetTouchpoints.$inferInsert;

// ---------------------------------------------------------------------------
// Phase 4 — placement_documents (compliance doc vault)
//
// One row per signed / required document attached to a placement or to a
// company-bound employee (e.g. annual I-9 reverification). The actual
// file storage is R2 (filePath) or a third-party e-sign provider that
// owns the canonical artifact (providerRef + providerName).
// ---------------------------------------------------------------------------

export const placementDocuments = pgTable("placement_documents", {
  id: uuid("id").primaryKey().defaultRandom(),
  // Either placementId OR (companyId + userId) is set. Placement-bound
  // docs travel with the engagement; company-bound docs (I-9, W-9) outlive
  // any single placement. NOT a polymorphic kind enum because the two
  // axes are orthogonal (a doc can be both).
  placementId: uuid("placement_id"),
  companyId: uuid("company_id").references(() => companyProfiles.id, { onDelete: "cascade" }),
  userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }),
  // i9 | w9 | w8ben | coi | bg_check | msa | sow | offer_letter | nda | other
  kind: varchar("kind", { length: 32 }).notNull(),
  filePath: text("file_path"),
  // For e-signed docs: which provider holds the canonical signed PDF.
  // docusign | anvil | hellosign | dropbox-sign | native
  providerName: varchar("provider_name", { length: 32 }),
  providerRef: varchar("provider_ref", { length: 200 }),
  signedAt: timestamp("signed_at", { withTimezone: true }),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  // pending | signed | expired | revoked
  status: varchar("status", { length: 16 }).default("pending").notNull(),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index("idx_placement_docs_placement").on(t.placementId),
  index("idx_placement_docs_company_user").on(t.companyId, t.userId),
  index("idx_placement_docs_expiry").on(t.expiresAt).where(sql`expires_at IS NOT NULL`),
  index("idx_placement_documents_user_id").on(t.userId),
]);

export type PlacementDocument = typeof placementDocuments.$inferSelect;
export type NewPlacementDocument = typeof placementDocuments.$inferInsert;
