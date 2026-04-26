/**
 * Job pipeline — per-job kanban of candidates being moved through hiring stages.
 *
 * Decoupled from jobApplications because pipeline entries can be:
 *   - applied:  auto-created when a candidate applies via the public job page
 *   - manual:   recruiter sourced and added the candidate (no application row)
 *   - imported: bulk-import / ATS sync
 *
 * Touchpoints (emails, SMS, calls, notes, interview-scheduled, stage changes)
 * are logged in `pipelineTouchpoints` for the audit trail. v1 emits stage_change
 * automatically; richer touchpoint capture (inline email composer, SMS) lands in
 * a follow-up.
 */
import { pgTable, uuid, varchar, text, jsonb, timestamp, index } from "drizzle-orm/pg-core";
import { users } from "./users.js";
import { jobItems, jobApplications } from "./jobs.js";

export const PIPELINE_STAGES = [
  "applied",
  "longlist",
  "screening",
  "interviewing",
  "shortlist",
  "submitted",
  "offer",
  "hired",
  "rejected",
] as const;
export type PipelineStage = (typeof PIPELINE_STAGES)[number];

export const PIPELINE_STAGE_LABELS: Record<PipelineStage, string> = {
  applied: "Applied",
  longlist: "Long List",
  screening: "Screening",
  interviewing: "Interviewing",
  shortlist: "Short List",
  submitted: "Submitted",
  offer: "Offer",
  hired: "Hired",
  rejected: "Rejected",
};

export const PIPELINE_ADDED_FROM = ["applied", "manual", "imported", "sourcing_bid"] as const;
export type PipelineAddedFrom = (typeof PIPELINE_ADDED_FROM)[number];

export const jobPipelineEntries = pgTable(
  "job_pipeline_entries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    jobId: uuid("job_id").notNull().references(() => jobItems.id, { onDelete: "cascade" }),

    // Candidate identity — userId is nullable so off-platform candidates
    // (sourced from external lists, LinkedIn) can also be tracked.
    candidateUserId: uuid("candidate_user_id").references(() => users.id, { onDelete: "set null" }),
    candidateName: varchar("candidate_name", { length: 200 }).notNull(),
    candidateEmail: varchar("candidate_email", { length: 320 }),
    candidatePhone: varchar("candidate_phone", { length: 50 }),
    candidateLocation: varchar("candidate_location", { length: 200 }),
    candidateLinkedinUrl: text("candidate_linkedin_url"),
    candidateResumeUrl: text("candidate_resume_url"),
    candidateAvatarUrl: text("candidate_avatar_url"),

    stage: varchar("stage", { length: 32 }).default("applied").notNull(),
    stageChangedAt: timestamp("stage_changed_at", { withTimezone: true }).defaultNow().notNull(),

    // Recruiter who owns / added this entry. May be null on auto-applied rows.
    ownerId: uuid("owner_id").references(() => users.id, { onDelete: "set null" }),

    addedFrom: varchar("added_from", { length: 32 }).default("manual").notNull(),
    jobApplicationId: uuid("job_application_id").references(() => jobApplications.id, { onDelete: "set null" }),

    notes: text("notes"),
    tags: jsonb("tags").default([]),
    rejectedAt: timestamp("rejected_at", { withTimezone: true }),
    rejectionReason: text("rejection_reason"),

    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("idx_pipeline_job_stage").on(t.jobId, t.stage),
    index("idx_pipeline_job_owner").on(t.jobId, t.ownerId),
    index("idx_pipeline_candidate_user").on(t.candidateUserId),
  ],
);

export type JobPipelineEntry = typeof jobPipelineEntries.$inferSelect;
export type NewJobPipelineEntry = typeof jobPipelineEntries.$inferInsert;

export const PIPELINE_TOUCHPOINT_TYPES = [
  "stage_change",
  "email",
  "sms",
  "call",
  "note",
  "interview_scheduled",
  "rejected",
  "added",
] as const;
export type PipelineTouchpointType = (typeof PIPELINE_TOUCHPOINT_TYPES)[number];

export const pipelineTouchpoints = pgTable(
  "pipeline_touchpoints",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    entryId: uuid("entry_id").notNull().references(() => jobPipelineEntries.id, { onDelete: "cascade" }),
    type: varchar("type", { length: 32 }).notNull(),
    payload: jsonb("payload").default({}),
    performedByUserId: uuid("performed_by_user_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("idx_touchpoints_entry_created").on(t.entryId, t.createdAt)],
);

export type PipelineTouchpoint = typeof pipelineTouchpoints.$inferSelect;
export type NewPipelineTouchpoint = typeof pipelineTouchpoints.$inferInsert;
