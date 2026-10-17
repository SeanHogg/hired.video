// Take-home assignments + per-stage question tagging
// (migrations 0135 / gaps #1386 + #1390).

import {
  pgTable,
  uuid,
  text,
  varchar,
  timestamp,
  jsonb,
  integer,
  index,
  check,
} from "drizzle-orm/pg-core";

import { users } from "./users.js";
import {
  interviewKitStages,
  scorecardSubmissions,
  competencies,
} from "./scorecards.js";
import { sql } from "drizzle-orm";

export const takeHomeAssignments = pgTable(
  "take_home_assignments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    kitStageId: uuid("kit_stage_id")
      .notNull()
      .references(() => interviewKitStages.id, { onDelete: "cascade" }),
    prompt: text("prompt").notNull(),
    deliveryFormat: varchar("delivery_format", { length: 32 })
      .notNull()
      .default("github_url"),
    dueInHours: integer("due_in_hours").notNull().default(72),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    kitStageIdx: index("take_home_assignments_kit_stage_idx").on(t.kitStageId),
  }),
);

export type TakeHomeAssignment = typeof takeHomeAssignments.$inferSelect;

export const takeHomeSubmissions = pgTable(
  "take_home_submissions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    assignmentId: uuid("assignment_id")
      .notNull()
      .references(() => takeHomeAssignments.id, { onDelete: "cascade" }),
    applicationId: text("application_id").notNull(),
    candidateUserId: uuid("candidate_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    deliveryUrl: text("delivery_url"),
    fileRefs: jsonb("file_refs").notNull().$type<string[]>().default([] as any),
    textResponse: text("text_response"),
    inviteToken: varchar("invite_token", { length: 64 }).unique(),
    tokenExpiresAt: timestamp("token_expires_at", { withTimezone: true }),
    submittedAt: timestamp("submitted_at", { withTimezone: true }),
    evaluatorScorecardSubmissionId: uuid("evaluator_scorecard_submission_id").references(
      () => scorecardSubmissions.id,
      { onDelete: "set null" },
    ),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    assignmentIdx: index("take_home_submissions_assignment_idx").on(t.assignmentId),
    applicationIdx: index("take_home_submissions_application_idx").on(t.applicationId),
    candidateUserIdFkIdx: index("idx_take_home_submissions_candidate_user_id").on(t.candidateUserId),
    evaluatorScorecardSubmissionIdFkIdx: index("idx_take_home_submissions_evaluator_scorecard_submission_id").on(t.evaluatorScorecardSubmissionId),
  }),
);

export type TakeHomeSubmission = typeof takeHomeSubmissions.$inferSelect;

// #1390 — question→competency tagging (replaces the JSONB list on
// kit_stages.suggested_questions for new questions).
export const interviewStageQuestions = pgTable(
  "interview_stage_questions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    kitStageId: uuid("kit_stage_id")
      .notNull()
      .references(() => interviewKitStages.id, { onDelete: "cascade" }),
    competencyId: uuid("competency_id").references(() => competencies.id, {
      onDelete: "set null",
    }),
    prompt: text("prompt").notNull(),
    difficulty: varchar("difficulty", { length: 8 }),
    /** 'star' | 'technical' | 'coding' | 'portfolio' | 'open' */
    expectedAnswer: varchar("expected_answer", { length: 16 }).notNull().default("open"),
    displayOrder: integer("display_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    stageIdx: index("interview_stage_questions_stage_idx").on(t.kitStageId),
    competencyIdx: index("interview_stage_questions_competency_idx").on(t.competencyId),
  }),
);

export type InterviewStageQuestion = typeof interviewStageQuestions.$inferSelect;

export const takeHomeInvites = pgTable(
  "take_home_invites",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    stageId: uuid("stage_id").notNull(),
    candidateEmail: varchar("candidate_email", { length: 255 }).notNull(),
    candidateName: varchar("candidate_name", { length: 255 }),
    inviteToken: varchar("invite_token", { length: 64 }).notNull().unique(),
    status: varchar("status", { length: 16 }).notNull().default("pending"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }),
    submittedAt: timestamp("submitted_at", { withTimezone: true }),
    submissionId: uuid("submission_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("idx_take_home_invites_stage").on(t.stageId),
    check("take_home_invites_status_check", sql`${t.status} IN ('pending', 'started', 'submitted', 'expired')`),
  ],
);

export type TakeHomeInvite = typeof takeHomeInvites.$inferSelect;
export type NewTakeHomeInvite = typeof takeHomeInvites.$inferInsert;
