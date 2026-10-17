// Calibration sessions (migration 0133 / gap #1381). 3-6 interviewers
// re-score a set of past candidates blind, then the system reveals
// per-attribute deltas vs. the original cohort + the final decision.
//
// Lives in its own schema file because the rows are deliberately
// isolated from real hiring data — calibration scores never feed a
// debrief or a hiring decision.

import {
  pgTable,
  uuid,
  text,
  varchar,
  timestamp,
  jsonb,
  integer,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";

import { users } from "./users.js";
import { companyProfiles } from "./companies.js";
import { scorecardTemplates } from "./scorecards.js";

export const calibrationSessions = pgTable(
  "calibration_sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companyProfiles.id, { onDelete: "cascade" }),
    organizerId: uuid("organizer_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    templateId: uuid("template_id")
      .notNull()
      .references(() => scorecardTemplates.id, { onDelete: "restrict" }),
    name: varchar("name", { length: 200 }).notNull(),
    description: text("description"),
    /** 'open' (accepting submissions) | 'closed' (reveals deltas) | 'archived' */
    status: varchar("status", { length: 16 }).notNull().default("open"),
    candidateApplicationIds: jsonb("candidate_application_ids")
      .notNull()
      .$type<string[]>()
      .default([] as any),
    closedAt: timestamp("closed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    companyIdx: index("calibration_sessions_company_idx").on(t.companyId),
    organizerIdx: index("calibration_sessions_organizer_idx").on(t.organizerId),
    templateIdFkIdx: index("idx_calibration_sessions_template_id").on(t.templateId),
  }),
);

export type CalibrationSession = typeof calibrationSessions.$inferSelect;
export type NewCalibrationSession = typeof calibrationSessions.$inferInsert;

export const calibrationSubmissions = pgTable(
  "calibration_submissions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => calibrationSessions.id, { onDelete: "cascade" }),
    evaluatorUserId: uuid("evaluator_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    applicationId: text("application_id").notNull(),
    overallRecommendation: varchar("overall_recommendation", { length: 24 }),
    overallScore: integer("overall_score"),
    /** attributeId -> rating */
    ratings: jsonb("ratings")
      .notNull()
      .$type<Record<string, number | null>>()
      .default({} as any),
    notes: text("notes"),
    submittedAt: timestamp("submitted_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    evaluatorIdx: index("calibration_submissions_evaluator_idx").on(t.evaluatorUserId),
    perEvaluatorPerApplicationUnique: uniqueIndex(
      "calibration_submissions_unique",
    ).on(t.sessionId, t.evaluatorUserId, t.applicationId),
  }),
);

export type CalibrationSubmission = typeof calibrationSubmissions.$inferSelect;
export type NewCalibrationSubmission = typeof calibrationSubmissions.$inferInsert;
