// Structured-hiring scorecards & interview kits.
//
// Maps to Greenhouse's signature workflow: every job has an interview KIT
// (named bundle of stages + scorecard templates), every interview produces
// a SUBMISSION (one per evaluator), every submission has RATINGS across
// the template's rating ATTRIBUTES, and a final HIRING DECISION rolls all
// submissions for an application up into approve / reject / hold.

import {
  pgTable,
  uuid,
  text,
  varchar,
  timestamp,
  jsonb,
  integer,
  boolean,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";

import { users } from "./users.js";
import { companyProfiles } from "./companies.js";
import { jobItems } from "./jobs.js";
import { interviews } from "./messaging.js"; // scheduled recruiter↔candidate interview

// ---------------------------------------------------------------------------
// Scorecard templates — reusable rubric per role / role family.
// ---------------------------------------------------------------------------
export const scorecardTemplates = pgTable(
  "scorecard_templates",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companyProfiles.id, { onDelete: "cascade" }),
    createdByUserId: uuid("created_by_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 200 }).notNull(),
    description: text("description"),
    // Default rating scale used by attributes: "1-4" | "1-5" | "thumbs" | "yes-no"
    ratingScale: varchar("rating_scale", { length: 16 }).notNull().default("1-4"),
    // Optional role-family tag so we can filter templates by role.
    roleFamily: varchar("role_family", { length: 100 }),
    isArchived: boolean("is_archived").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    companyIdx: index("scorecard_templates_company_idx").on(t.companyId),
  }),
);

export type ScorecardTemplate = typeof scorecardTemplates.$inferSelect;
export type NewScorecardTemplate = typeof scorecardTemplates.$inferInsert;

// Rating attribute on a template — e.g. "Technical depth", "Communication",
// "Leadership". Each carries an optional weight so debriefs can compute a
// weighted overall.
export const scorecardAttributes = pgTable(
  "scorecard_attributes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    templateId: uuid("template_id")
      .notNull()
      .references(() => scorecardTemplates.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 200 }).notNull(),
    description: text("description"),
    displayOrder: integer("display_order").notNull().default(0),
    weight: integer("weight").notNull().default(1),
    // Optional anchor descriptions per rating value, e.g. {"1": "Below bar", "4": "Strong"}
    anchors: jsonb("anchors"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    templateIdx: index("scorecard_attributes_template_idx").on(t.templateId),
  }),
);

export type ScorecardAttribute = typeof scorecardAttributes.$inferSelect;
export type NewScorecardAttribute = typeof scorecardAttributes.$inferInsert;

// ---------------------------------------------------------------------------
// Interview kits — named bundle of stages + scorecard templates per job.
// ---------------------------------------------------------------------------
export const interviewKits = pgTable(
  "interview_kits",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companyProfiles.id, { onDelete: "cascade" }),
    // Optional job binding — kit can be reused across jobs if jobId is null.
    jobId: uuid("job_id").references(() => jobItems.id, { onDelete: "set null" }),
    createdByUserId: uuid("created_by_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 200 }).notNull(),
    description: text("description"),
    isArchived: boolean("is_archived").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    companyIdx: index("interview_kits_company_idx").on(t.companyId),
    jobIdx: index("interview_kits_job_idx").on(t.jobId),
  }),
);

export type InterviewKit = typeof interviewKits.$inferSelect;
export type NewInterviewKit = typeof interviewKits.$inferInsert;

// A stage in a kit — e.g. "Recruiter screen", "Hiring manager", "Onsite — System Design".
// Each stage points at a scorecard template the evaluator should fill.
export const interviewKitStages = pgTable(
  "interview_kit_stages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    kitId: uuid("kit_id")
      .notNull()
      .references(() => interviewKits.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 200 }).notNull(),
    description: text("description"),
    displayOrder: integer("display_order").notNull().default(0),
    durationMinutes: integer("duration_minutes").default(60),
    // Suggested questions the interviewer can ask in this stage.
    suggestedQuestions: jsonb("suggested_questions"),
    // Which scorecard template fills out this stage.
    scorecardTemplateId: uuid("scorecard_template_id").references(
      () => scorecardTemplates.id,
      { onDelete: "set null" },
    ),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    kitIdx: index("interview_kit_stages_kit_idx").on(t.kitId),
  }),
);

export type InterviewKitStage = typeof interviewKitStages.$inferSelect;
export type NewInterviewKitStage = typeof interviewKitStages.$inferInsert;

// ---------------------------------------------------------------------------
// Scorecard submissions — one per evaluator per interview.
// ---------------------------------------------------------------------------
//
// `applicationId` is intentionally a free-form text column rather than a
// hard FK because the application-pipeline schema is polymorphic across
// multiple sources (jobApplications, sourcing, talent pool). The route
// validates existence at write time.
export const scorecardSubmissions = pgTable(
  "scorecard_submissions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    templateId: uuid("template_id")
      .notNull()
      .references(() => scorecardTemplates.id, { onDelete: "restrict" }),
    // Optional binding to a scheduled interview from messaging.interviews.
    interviewId: uuid("interview_id").references(() => interviews.id, {
      onDelete: "set null",
    }),
    // Optional binding to a kit stage so debriefs can group by stage.
    kitStageId: uuid("kit_stage_id").references(() => interviewKitStages.id, {
      onDelete: "set null",
    }),
    applicationId: text("application_id").notNull(),
    candidateUserId: uuid("candidate_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    evaluatorUserId: uuid("evaluator_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    // "strong_yes" | "yes" | "no" | "strong_no" | null
    overallRecommendation: varchar("overall_recommendation", { length: 24 }),
    // Computed at submit time: weighted mean of ratings across attributes.
    overallScore: integer("overall_score"),
    summary: text("summary"),
    strengths: text("strengths"),
    concerns: text("concerns"),
    // "draft" | "submitted"
    status: varchar("status", { length: 16 }).notNull().default("draft"),
    submittedAt: timestamp("submitted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    applicationIdx: index("scorecard_submissions_application_idx").on(t.applicationId),
    evaluatorIdx: index("scorecard_submissions_evaluator_idx").on(t.evaluatorUserId),
    interviewIdx: index("scorecard_submissions_interview_idx").on(t.interviewId),
    // One submission per (interview, evaluator) — rerunning replaces the row.
    interviewEvaluatorUnique: uniqueIndex(
      "scorecard_submissions_interview_evaluator_unique",
    ).on(t.interviewId, t.evaluatorUserId),
  }),
);

export type ScorecardSubmission = typeof scorecardSubmissions.$inferSelect;
export type NewScorecardSubmission = typeof scorecardSubmissions.$inferInsert;

// Per-attribute rating inside a submission.
export const scorecardSubmissionRatings = pgTable(
  "scorecard_submission_ratings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    submissionId: uuid("submission_id")
      .notNull()
      .references(() => scorecardSubmissions.id, { onDelete: "cascade" }),
    attributeId: uuid("attribute_id")
      .notNull()
      .references(() => scorecardAttributes.id, { onDelete: "cascade" }),
    // 1..N integer rating; "thumbs"/"yes-no" scales encode 0/1.
    rating: integer("rating"),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    submissionAttrUnique: uniqueIndex(
      "scorecard_submission_ratings_submission_attribute_unique",
    ).on(t.submissionId, t.attributeId),
  }),
);

export type ScorecardSubmissionRating = typeof scorecardSubmissionRatings.$inferSelect;
export type NewScorecardSubmissionRating = typeof scorecardSubmissionRatings.$inferInsert;

// ---------------------------------------------------------------------------
// Hiring decisions — final roll-up per (application, job).
// ---------------------------------------------------------------------------
export const hiringDecisions = pgTable(
  "hiring_decisions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companyProfiles.id, { onDelete: "cascade" }),
    jobId: uuid("job_id").references(() => jobItems.id, { onDelete: "set null" }),
    applicationId: text("application_id").notNull(),
    candidateUserId: uuid("candidate_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    decidedByUserId: uuid("decided_by_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    // "approve" | "reject" | "hold" | "withdraw"
    decision: varchar("decision", { length: 16 }).notNull(),
    reason: text("reason"),
    // Snapshotted aggregate at decision time (avg score, attribute breakdown).
    aggregateSnapshot: jsonb("aggregate_snapshot"),
    decidedAt: timestamp("decided_at", { withTimezone: true }).defaultNow().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    applicationIdx: index("hiring_decisions_application_idx").on(t.applicationId),
    companyIdx: index("hiring_decisions_company_idx").on(t.companyId),
  }),
);

export type HiringDecision = typeof hiringDecisions.$inferSelect;
export type NewHiringDecision = typeof hiringDecisions.$inferInsert;
