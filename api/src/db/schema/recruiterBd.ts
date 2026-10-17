/**
 * Agency-recruiter BD pipeline (#99, #222, #223).
 *
 *   recruiter_clients          — client companies the recruiter is selling into
 *   recruiter_client_contacts  — hiring manager / HR director contacts per client
 *   pipeline_stages            — per-recruiter configurable funnel stages (#222)
 *   recruiter_deals            — BD opportunities with $-value + win-prob + owner (#223)
 *
 * Separate from `placements` (which lives in `recruiter.ts` and tracks the
 * CANDIDATE side post-hire). This file tracks the EMPLOYER relationship
 * side — the client funnel that produces the requisitions the placement
 * desk then fills.
 */

import { sql } from "drizzle-orm";
import {
  pgTable,
  uuid,
  text,
  varchar,
  integer,
  boolean,
  timestamp,
  date,
  index,
  uniqueIndex,
  check,
} from "drizzle-orm/pg-core";
import { users } from "./users.js";
import { companyProfiles } from "./companies.js";

export const recruiterClients = pgTable(
  "recruiter_clients",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    recruiterUserId: uuid("recruiter_user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    /** #1766 — agency-team sharing. When set, every member of this workspace
     *  (company/agency) sees the client, not just the creating recruiter.
     *  NULL = legacy owner-only. Reads fall through (workspaceId IN scope OR
     *  recruiterUserId = caller). FK to the company/agency the recruiter acts for. */
    workspaceId: uuid("workspace_id").references(() => companyProfiles.id, { onDelete: "set null" }),
    companyId: uuid("company_id").references(() => companyProfiles.id, { onDelete: "set null" }),
    clientName: varchar("client_name", { length: 255 }).notNull(),
    website: varchar("website", { length: 255 }),
    industry: varchar("industry", { length: 120 }),
    /** prospect | qualified | contract | active | churned. */
    status: varchar("status", { length: 32 }).notNull().default("prospect"),
    notes: text("notes"),
    lastActivityAt: timestamp("last_activity_at", { withTimezone: true }),
    openRequisitions: integer("open_requisitions").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("idx_recruiter_clients_recruiter").on(t.recruiterUserId, t.status),
    index("idx_recruiter_clients_workspace").on(t.workspaceId),
    check("recruiter_clients_status_check", sql`${t.status} IN ('prospect', 'qualified', 'contract', 'active', 'churned')`),
    index("idx_recruiter_clients_company_id").on(t.companyId),
  ],
);

export type RecruiterClient = typeof recruiterClients.$inferSelect;
export type NewRecruiterClient = typeof recruiterClients.$inferInsert;

export const recruiterClientContacts = pgTable(
  "recruiter_client_contacts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clientId: uuid("client_id").notNull().references(() => recruiterClients.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 255 }).notNull(),
    title: varchar("title", { length: 255 }),
    email: varchar("email", { length: 255 }),
    phone: varchar("phone", { length: 64 }),
    isPrimary: boolean("is_primary").notNull().default(false),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("idx_recruiter_client_contacts_client").on(t.clientId)],
);

export type RecruiterClientContact = typeof recruiterClientContacts.$inferSelect;
export type NewRecruiterClientContact = typeof recruiterClientContacts.$inferInsert;

export const pipelineStages = pgTable(
  "pipeline_stages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    recruiterUserId: uuid("recruiter_user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    pipelineKey: varchar("pipeline_key", { length: 32 }).notNull().default("default"),
    stageKey: varchar("stage_key", { length: 48 }).notNull(),
    stageLabel: varchar("stage_label", { length: 128 }).notNull(),
    ordinal: integer("ordinal").notNull().default(0),
    defaultValueCents: integer("default_value_cents"),
    /** 0-10_000 basis points (so 0.00%-100.00% with two decimal precision). */
    winProbabilityBps: integer("win_probability_bps"),
    isClosedWon: boolean("is_closed_won").notNull().default(false),
    isClosedLost: boolean("is_closed_lost").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("uq_pipeline_stages_recruiter_pipeline_stage").on(t.recruiterUserId, t.pipelineKey, t.stageKey),
    index("idx_pipeline_stages_recruiter_pipeline").on(t.recruiterUserId, t.pipelineKey, t.ordinal),
    check("pipeline_stages_win_probability_bps_check", sql`${t.winProbabilityBps} IS NULL OR (${t.winProbabilityBps} >= 0 AND ${t.winProbabilityBps} <= 10000)`),
  ],
);

export type BdPipelineStage = typeof pipelineStages.$inferSelect;
export type NewBdPipelineStage = typeof pipelineStages.$inferInsert;

export const recruiterDeals = pgTable(
  "recruiter_deals",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    recruiterUserId: uuid("recruiter_user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    /** #1766 — agency-team sharing (see recruiter_clients.workspaceId). NULL =
     *  legacy owner-only; reads fall through workspaceId-in-scope OR owner. */
    workspaceId: uuid("workspace_id").references(() => companyProfiles.id, { onDelete: "set null" }),
    clientId: uuid("client_id").references(() => recruiterClients.id, { onDelete: "set null" }),
    /** Optional FK to job_items. No FK constraint because jobs may live in
     *  a soft-deleted state we still want to keep deals against. */
    jobId: uuid("job_id"),
    name: varchar("name", { length: 255 }).notNull(),
    /** #223 — Custom pipeline assignment. NULL = use the recruiter's default
     *  pipeline; non-null = the deal lives on a specific stage row (which
     *  itself encodes the pipeline_key + stage_key + ordinal). */
    pipelineId: uuid("pipeline_id").references(() => pipelineStages.id, { onDelete: "set null" }),
    pipelineKey: varchar("pipeline_key", { length: 32 }).notNull().default("default"),
    stageKey: varchar("stage_key", { length: 48 }).notNull().default("prospect"),
    /** #223 — Owner switcher. NULL = unassigned; non-null = ownerType +
     *  ownerUserId combo describing who's responsible. */
    ownerUserId: uuid("owner_user_id").references(() => users.id, { onDelete: "set null" }),
    ownerType: varchar("owner_type", { length: 24 }).notNull().default("recruiter"),
    estFeeCents: integer("est_fee_cents"),
    winProbabilityBps: integer("win_probability_bps"),
    expectedCloseDate: date("expected_close_date"),
    closedAt: timestamp("closed_at", { withTimezone: true }),
    isWon: boolean("is_won"),
    lastActivityAt: timestamp("last_activity_at", { withTimezone: true }),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("idx_recruiter_deals_recruiter").on(t.recruiterUserId, t.stageKey),
    index("idx_recruiter_deals_client").on(t.clientId),
    index("idx_recruiter_deals_owner").on(t.ownerUserId),
    index("idx_recruiter_deals_workspace").on(t.workspaceId),
    check("recruiter_deals_win_probability_bps_check", sql`${t.winProbabilityBps} IS NULL OR (${t.winProbabilityBps} >= 0 AND ${t.winProbabilityBps} <= 10000)`),
    index("idx_recruiter_deals_pipeline_id").on(t.pipelineId),
  ],
);

export type RecruiterDeal = typeof recruiterDeals.$inferSelect;
export type NewRecruiterDeal = typeof recruiterDeals.$inferInsert;

// ---------------------------------------------------------------------------
// Default pipeline seed values — used by the service layer when a recruiter
// hits the BD pipeline routes for the first time and has no rows in
// `pipeline_stages` yet. Kept here so the canonical funnel shape ships with
// the schema rather than scattered across migrations + service files.
// ---------------------------------------------------------------------------
export const DEFAULT_BD_PIPELINE: ReadonlyArray<{
  stageKey: string;
  stageLabel: string;
  winProbabilityBps: number;
  isClosedWon?: boolean;
  isClosedLost?: boolean;
}> = [
  { stageKey: "prospect",      stageLabel: "Prospect",       winProbabilityBps: 1_000 },
  { stageKey: "qualified",     stageLabel: "Qualified",      winProbabilityBps: 2_500 },
  { stageKey: "discovery",     stageLabel: "Discovery",      winProbabilityBps: 4_000 },
  { stageKey: "proposal",      stageLabel: "Proposal",       winProbabilityBps: 6_000 },
  { stageKey: "contract",      stageLabel: "Contract",       winProbabilityBps: 8_500 },
  { stageKey: "active",        stageLabel: "Active",         winProbabilityBps: 10_000, isClosedWon: true },
  { stageKey: "churned",       stageLabel: "Churned",        winProbabilityBps: 0,      isClosedLost: true },
];
