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
} from "drizzle-orm/pg-core";

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
});

export const tagAssignments = pgTable("tag_assignments", {
  id: uuid("id").primaryKey().defaultRandom(),
  tagId: uuid("tag_id").notNull().references(() => workspaceTags.id, { onDelete: "cascade" }),
  axis: varchar("axis", { length: 16 }).notNull(),
  entityId: uuid("entity_id").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

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
});

export type WorkspaceJobType = typeof workspaceJobTypes.$inferSelect;
export type NewWorkspaceJobType = typeof workspaceJobTypes.$inferInsert;

// ── #238 Sources ───────────────────────────────────────────────────────
export const workspaceSources = pgTable("workspace_sources", {
  id: uuid("id").primaryKey().defaultRandom(),
  workspaceId: uuid("workspace_id"),
  slug: varchar("slug", { length: 48 }).notNull(),
  label: varchar("label", { length: 96 }).notNull(),
  isBuiltIn: boolean("is_built_in").default(false).notNull(),
  orderIndex: integer("order_index").default(0).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export type WorkspaceSource = typeof workspaceSources.$inferSelect;
export type NewWorkspaceSource = typeof workspaceSources.$inferInsert;
