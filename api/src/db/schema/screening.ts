// screening.ts — Candidate screening templates + magic-link screening requests.
//
// A recruiter / employer authors a reusable, per-role SCREENING TEMPLATE: an
// ordered checklist of items (résumé, contact confirmation, validated AI
// assessments, competency tests, async video interview, references, tool runs,
// application questions) with each item marked required or optional. Résumé +
// contact confirmation are always-required (enforced in shared/screening.ts).
//
// Sending a template to a candidate creates a SCREENING REQUEST: the items are
// SNAPSHOT onto screening_request_items (template edits must not mutate a sent
// request), a magic-link token is minted, and the candidate completes the
// outstanding items in the public portal. Items the candidate already satisfies
// from their existing "pitch book" (a completed assessment, an on-file résumé)
// are pre-marked satisfied at creation time by the pitch-book resolver.
//
// Request anchoring (decided 2026-05-31): job-scoped REQUEST (optional jobId /
// applicationId) but candidate-level RESULTS — completed items live on the
// candidate's own assessment/résumé/reference records, so they're never
// re-requested across jobs.
//
// itemType + result-pointer are intentionally polymorphic (varchar + jsonb +
// a plain-uuid refId with no FK, mirroring take_home_invites.stage_id) because
// an item can point at six different result tables. The allowed itemType /
// status values are CHECK-constrained from the shared/screening.ts registry so
// frontend + backend can't drift (migration 0191).

import { sql } from "drizzle-orm";
import {
  pgTable,
  uuid,
  text,
  varchar,
  boolean,
  timestamp,
  integer,
  jsonb,
  index,
  check,
} from "drizzle-orm/pg-core";
import { users } from "./users.js";
import { companyProfiles } from "./companies.js";
import { jobItems, jobApplications } from "./jobs.js";

// ─── screening_templates ─────────────────────────────────────────────────────
// Company-owned, reusable per-role checklist. Private to the owning company;
// row-level filtering enforced in the route layer via resolveCompanyScope.

export const screeningTemplates = pgTable(
  "screening_templates",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companyProfiles.id, { onDelete: "cascade" }),
    createdByUserId: uuid("created_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    name: varchar("name", { length: 255 }).notNull(),
    description: text("description"),
    // Optional free-text role tag for filtering ("Senior Backend", "AE").
    roleFamily: varchar("role_family", { length: 120 }),
    // Optional default job binding; a request can still override.
    jobId: uuid("job_id").references(() => jobItems.id, { onDelete: "set null" }),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("screening_templates_company_idx").on(t.companyId),
    index("screening_templates_job_idx").on(t.jobId),
  ],
);

export type ScreeningTemplate = typeof screeningTemplates.$inferSelect;
export type NewScreeningTemplate = typeof screeningTemplates.$inferInsert;

// ─── screening_template_items ────────────────────────────────────────────────
// Ordered items on a template. `refId` is a plain uuid (no FK) because it points
// at different tables per itemType: competency_test → skill_assessments.id,
// video_interview → interview_question_sets.id. itemType is CHECK-constrained
// to SCREENING_ITEM_TYPES (migration 0191).

export const screeningTemplateItems = pgTable(
  "screening_template_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    templateId: uuid("template_id")
      .notNull()
      .references(() => screeningTemplates.id, { onDelete: "cascade" }),
    itemType: varchar("item_type", { length: 32 }).notNull(),
    refId: uuid("ref_id"),
    config: jsonb("config").default({}).notNull(),
    isRequired: boolean("is_required").default(true).notNull(),
    displayOrder: integer("display_order").default(0).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("screening_template_items_template_idx").on(t.templateId),
    check("screening_template_items_item_type_check", sql`${t.itemType} IN ('resume', 'contact_info', 'predictive_assessment', 'competency_test', 'video_interview', 'references', 'tool_run', 'application_questions')`),
  ],
);

export type ScreeningTemplateItem = typeof screeningTemplateItems.$inferSelect;
export type NewScreeningTemplateItem = typeof screeningTemplateItems.$inferInsert;

// ─── screening_requests ──────────────────────────────────────────────────────
// One instance of a template sent to one candidate via a magic link. The token
// is an unguessable bearer (same model as take_home_invites / reference shares),
// so the public portal GET is safe to leave unauthenticated.

export const screeningRequests = pgTable(
  "screening_requests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companyProfiles.id, { onDelete: "cascade" }),
    createdByUserId: uuid("created_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    // Source template (nullable — items are snapshot, so the request survives
    // template deletion).
    templateId: uuid("template_id").references(() => screeningTemplates.id, {
      onDelete: "set null",
    }),
    // Job-scoped request (optional). Results stay candidate-level.
    jobId: uuid("job_id").references(() => jobItems.id, { onDelete: "set null" }),
    applicationId: uuid("application_id").references(() => jobApplications.id, {
      onDelete: "set null",
    }),
    // Bound when the candidate is a known user, or on portal claim.
    candidateUserId: uuid("candidate_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    candidateEmail: varchar("candidate_email", { length: 255 }).notNull(),
    candidateName: varchar("candidate_name", { length: 255 }),
    token: varchar("token", { length: 64 }).notNull().unique(),
    tokenExpiresAt: timestamp("token_expires_at", { withTimezone: true }).notNull(),
    // pending | in_progress | completed | expired (CHECK in 0191).
    status: varchar("status", { length: 16 }).default("pending").notNull(),
    // Optional recruiter note shown in the invitation email + portal header.
    message: text("message"),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    lastSentAt: timestamp("last_sent_at", { withTimezone: true }),
    resendCount: integer("resend_count").default(0).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("screening_requests_company_idx").on(t.companyId),
    index("screening_requests_token_idx").on(t.token),
    index("screening_requests_candidate_email_idx").on(t.candidateEmail),
    index("screening_requests_application_idx").on(t.applicationId),
    check("screening_requests_status_check", sql`${t.status} IN ('pending', 'in_progress', 'completed', 'expired')`),
  ],
);

export type ScreeningRequest = typeof screeningRequests.$inferSelect;
export type NewScreeningRequest = typeof screeningRequests.$inferInsert;

// ─── screening_request_items ─────────────────────────────────────────────────
// Per-item status + result linkage on a sent request. `config` is a snapshot of
// the template item's config at send time. `resultRef` points at the produced
// artifact (assessmentRunId, attemptId, interviewId, resumeId, answers, …) so
// the recruiter results view can resolve each completion.

export const screeningRequestItems = pgTable(
  "screening_request_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    requestId: uuid("request_id")
      .notNull()
      .references(() => screeningRequests.id, { onDelete: "cascade" }),
    itemType: varchar("item_type", { length: 32 }).notNull(),
    refId: uuid("ref_id"),
    config: jsonb("config").default({}).notNull(),
    isRequired: boolean("is_required").default(true).notNull(),
    displayOrder: integer("display_order").default(0).notNull(),
    // outstanding | satisfied | skipped (CHECK in 0191).
    status: varchar("status", { length: 16 }).default("outstanding").notNull(),
    // pre_existing | completed_now (CHECK in 0191; nullable until satisfied).
    satisfiedSource: varchar("satisfied_source", { length: 16 }),
    resultRef: jsonb("result_ref"),
    satisfiedAt: timestamp("satisfied_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("screening_request_items_request_idx").on(t.requestId),
    check("screening_request_items_item_type_check", sql`${t.itemType} IN ('resume', 'contact_info', 'predictive_assessment', 'competency_test', 'video_interview', 'references', 'tool_run', 'application_questions')`),
    check("screening_request_items_status_check", sql`${t.status} IN ('outstanding', 'satisfied', 'skipped')`),
    check("screening_request_items_satisfied_source_check", sql`${t.satisfiedSource} IS NULL OR ${t.satisfiedSource} IN ('pre_existing', 'completed_now')`),
  ],
);

export type ScreeningRequestItem = typeof screeningRequestItems.$inferSelect;
export type NewScreeningRequestItem = typeof screeningRequestItems.$inferInsert;
