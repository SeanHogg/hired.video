// Workspace-scoped taxonomy tables introduced in migration 0121.
//
// Three small bounded vocabularies share this file because they share a
// shape (workspace_id + slug-or-name + built-in flag + order_index) and
// land together as one PR (#231 / #232 / #238).
//
// The hand-picked color palette + label fields live in DB rows rather
// than a TS enum so a recruiter can rename / re-color a built-in tag
// without a code deploy. The `is_built_in` flag is only used to surface
// a "Reset to defaults" affordance — built-ins are editable.

import {
  pgTable,
  uuid,
  varchar,
  boolean,
  integer,
  bigint,
  timestamp,
  uniqueIndex,
  index,
  check,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { contacts } from "./contacts.js";

// ── #231 Tags ──────────────────────────────────────────────────────────
export const workspaceTags = pgTable("workspace_tags", {
  id: uuid("id").primaryKey().defaultRandom(),
  workspaceId: uuid("workspace_id"),
  /** 'company' | 'job' | 'person' — stored as varchar to keep the
   *  vocabulary open without a DB migration; the runtime narrows via
   *  the `TagAxis` type in tags-service.ts. */
  axis: varchar("axis", { length: 16 }).notNull(),
  name: varchar("name", { length: 64 }).notNull(),
  colorHex: varchar("color_hex", { length: 7 }).default("#94a3b8").notNull(),
  orderIndex: integer("order_index").default(0).notNull(),
  isBuiltIn: boolean("is_built_in").default(false).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index("idx_workspace_tags_axis_order").on(t.axis, t.orderIndex),
  // #2305 — legacy UNIQUE (migration 0121_taxonomies_archive_versions.sql); duplicates resolved by 0518_dedupe_unique_indexes.sql.
  uniqueIndex("uq_workspace_tags_workspace_axis_name").on(t.workspaceId, t.axis, sql`lower(${t.name})`),
]);

export const tagAssignments = pgTable("tag_assignments", {
  id: uuid("id").primaryKey().defaultRandom(),
  tagId: uuid("tag_id").notNull().references(() => workspaceTags.id, { onDelete: "cascade" }),
  axis: varchar("axis", { length: 16 }).notNull(),
  entityId: uuid("entity_id").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index("idx_tag_assignments_axis_entity").on(t.axis, t.entityId),
  // #2305 — legacy UNIQUE (migration 0121_taxonomies_archive_versions.sql); duplicates resolved by 0518_dedupe_unique_indexes.sql.
  uniqueIndex("uq_tag_assignments_tag_entity").on(t.tagId, t.entityId),
]);

export type WorkspaceTag = typeof workspaceTags.$inferSelect;
export type NewWorkspaceTag = typeof workspaceTags.$inferInsert;
export type TagAssignment = typeof tagAssignments.$inferSelect;

// ── #232 Job Types ─────────────────────────────────────────────────────
export const workspaceJobTypes = pgTable("workspace_job_types", {
  id: uuid("id").primaryKey().defaultRandom(),
  workspaceId: uuid("workspace_id"),
  slug: varchar("slug", { length: 48 }).notNull(),
  label: varchar("label", { length: 96 }).notNull(),
  /** Default financial knobs in minor units / bps. Null means "no
   *  default", surfaced as a blank field in the placement editor. */
  defaultBillRateCents: bigint("default_bill_rate_cents", { mode: "number" }),
  defaultPayRateCents: bigint("default_pay_rate_cents", { mode: "number" }),
  defaultOvertimeMultiplierBps: integer("default_overtime_multiplier_bps"),
  defaultFeeBps: integer("default_fee_bps"),
  /** 'yearly' | 'hourly' — drives the rate-basis pill in the editor. */
  rateBasis: varchar("rate_basis", { length: 8 }).default("yearly").notNull(),
  isBuiltIn: boolean("is_built_in").default(false).notNull(),
  orderIndex: integer("order_index").default(0).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  // #2305 — legacy UNIQUE (migration 0121_taxonomies_archive_versions.sql); duplicates resolved by 0518_dedupe_unique_indexes.sql.
  uniqueIndex("uq_workspace_job_types_workspace_slug").on(t.workspaceId, t.slug),
]);

export type WorkspaceJobType = typeof workspaceJobTypes.$inferSelect;
export type NewWorkspaceJobType = typeof workspaceJobTypes.$inferInsert;

// ── #238 Sources ───────────────────────────────────────────────────────
// ── #265 Person-merge review queue + workspace policy ─────────────────
/** Per-workspace policy for duplicate contacts found by the contacts
 *  reconciler (services/contacts/). `auto` merges whenever confidence ≥
 *  `autoThresholdBps`; `review` drops the pair into `person_merge_queue`
 *  for owner approval. target/source ids reference `contacts` (0493). */
export const workspacePersonMergePolicy = pgTable("workspace_person_merge_policy", {
  workspaceId: uuid("workspace_id").primaryKey(),
  mode: varchar("mode", { length: 16 }).default("auto").notNull(),
  autoThresholdBps: integer("auto_threshold_bps").default(9500).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const personMergeQueue = pgTable("person_merge_queue", {
  id: uuid("id").primaryKey().defaultRandom(),
  workspaceId: uuid("workspace_id"),
  ownerUserId: uuid("owner_user_id").notNull(),
  /** Older contact the duplicate folds into (contacts.id, 0493). */
  targetPersonId: uuid("target_person_id").notNull().references(() => contacts.id, { onDelete: "cascade" }),
  /** Newer duplicate contact (contacts.id, 0493). */
  sourcePersonId: uuid("source_person_id").notNull().references(() => contacts.id, { onDelete: "cascade" }),
  confidenceBps: integer("confidence_bps").notNull(),
  /** MERGE_QUEUE_STATUSES (shared/contacts.ts). */
  status: varchar("status", { length: 16 }).default("pending").notNull(),
  decidedAt: timestamp("decided_at", { withTimezone: true }),
  decidedBy: uuid("decided_by"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  uqPair: uniqueIndex("uq_person_merge_queue_pair").on(t.targetPersonId, t.sourcePersonId),
  idxPersonMergeQueueOwnerStatus: index("idx_person_merge_queue_owner_status").on(t.ownerUserId, t.status),
  idxPersonMergeQueueWorkspaceStatus: index("idx_person_merge_queue_workspace_status").on(t.workspaceId, t.status),
  statusCheck: check("person_merge_queue_status_check", sql`${t.status} IN ('pending', 'approved', 'rejected', 'merged', 'expired')`),
  sourcePersonIdFkIdx: index("idx_person_merge_queue_source_person_id").on(t.sourcePersonId),
}));
export type PersonMergeQueueRow = typeof personMergeQueue.$inferSelect;
export type NewPersonMergeQueueRow = typeof personMergeQueue.$inferInsert;
export type WorkspacePersonMergePolicy = typeof workspacePersonMergePolicy.$inferSelect;

export const workspaceSources = pgTable("workspace_sources", {
  id: uuid("id").primaryKey().defaultRandom(),
  workspaceId: uuid("workspace_id"),
  slug: varchar("slug", { length: 48 }).notNull(),
  label: varchar("label", { length: 96 }).notNull(),
  isBuiltIn: boolean("is_built_in").default(false).notNull(),
  orderIndex: integer("order_index").default(0).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  // #2305 — legacy UNIQUE (migration 0121_taxonomies_archive_versions.sql); duplicates resolved by 0518_dedupe_unique_indexes.sql.
  uniqueIndex("uq_workspace_sources_workspace_slug").on(t.workspaceId, t.slug),
]);

export type WorkspaceSource= typeof workspaceSources.$inferSelect;
export type NewWorkspaceSource = typeof workspaceSources.$inferInsert;
