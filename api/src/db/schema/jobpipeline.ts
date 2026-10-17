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

// Re-export the shared enum so existing call sites don't have to change paths.
export {
  PIPELINE_STAGES,
  PIPELINE_STAGE_LABELS,
  PIPELINE_ADDED_FROM,
  PIPELINE_TOUCHPOINT_TYPES,
  TERMINAL_STAGES,
  type PipelineStage,
  type PipelineAddedFrom,
  type PipelineTouchpointType,
} from "../../../../shared/recruiter-pipeline.js";

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
    index("idx_job_pipeline_entries_job_application_id").on(t.jobApplicationId),
    index("idx_job_pipeline_entries_owner_id").on(t.ownerId),
  ],
);

export type JobPipelineEntry = typeof jobPipelineEntries.$inferSelect;
export type NewJobPipelineEntry = typeof jobPipelineEntries.$inferInsert;

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
  (t) => [
    index("idx_touchpoints_entry_created").on(t.entryId, t.createdAt),
    index("idx_pipeline_touchpoints_performed_by_user_id").on(t.performedByUserId),
  ],
);

export type PipelineTouchpoint = typeof pipelineTouchpoints.$inferSelect;
export type NewPipelineTouchpoint = typeof pipelineTouchpoints.$inferInsert;

/**
 * Tokenised read-only share link for the kanban — powers the "live hiring
 * manager portal" feature. Mirrors the studio_review_links pattern.
 */
export const pipelineShareLinks = pgTable(
  "pipeline_share_links",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    jobId: uuid("job_id").notNull().references(() => jobItems.id, { onDelete: "cascade" }),
    shareToken: varchar("share_token", { length: 64 }).notNull().unique(),
    label: varchar("label", { length: 200 }),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    createdByUserId: uuid("created_by_user_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("idx_pipeline_share_links_job").on(t.jobId),
    index("idx_pipeline_share_links_created_by_user_id").on(t.createdByUserId),
  ],
);

export type PipelineShareLink = typeof pipelineShareLinks.$inferSelect;
export type NewPipelineShareLink = typeof pipelineShareLinks.$inferInsert;
