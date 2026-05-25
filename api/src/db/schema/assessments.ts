// assessments.ts — Candidate skills assessments / tests (#76)
// Timed, AI-graded skills tests displayed on candidate profiles.

import {
  pgTable,
  uuid,
  text,
  varchar,
  boolean,
  timestamp,
  integer,
  jsonb,
  numeric,
} from "drizzle-orm/pg-core";
import { users } from "./users.js";

// Assessment definition (e.g. "JavaScript Fundamentals — 20 questions, 30 minutes")
export const skillAssessments = pgTable("skill_assessments", {
  id: uuid("id").primaryKey().defaultRandom(),
  slug: varchar("slug", { length: 100 }).notNull().unique(),
  title: varchar("title", { length: 255 }).notNull(),
  description: text("description"),
  // Skill category (e.g. "javascript", "react", "sql", "product-management")
  skillCategory: varchar("skill_category", { length: 100 }).notNull(),
  difficulty: varchar("difficulty", { length: 50 }).default("intermediate").notNull(), // beginner | intermediate | advanced
  // Time limit in minutes; null = no limit
  timeLimitMinutes: integer("time_limit_minutes").default(30),
  // Questions as JSONB: [{id, type, prompt, options?, correctAnswer, points}]
  questions: jsonb("questions").default([]).$type<Array<{
    id: string;
    type: "multiple_choice" | "true_false" | "code" | "short_answer";
    prompt: string;
    options?: string[];
    correctAnswer?: string | number;
    points: number;
  }>>(),
  passingScore: integer("passing_score").default(70).notNull(), // percentage
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export type SkillAssessment = typeof skillAssessments.$inferSelect;
export type NewSkillAssessment = typeof skillAssessments.$inferInsert;

// A candidate's attempt at an assessment
export const assessmentAttempts = pgTable("assessment_attempts", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  assessmentId: uuid("assessment_id").notNull().references(() => skillAssessments.id, { onDelete: "cascade" }),
  status: varchar("status", { length: 50 }).default("in_progress").notNull(), // in_progress | submitted | graded | expired
  // Candidate's answers: { questionId: answer }
  answers: jsonb("answers").default({}).$type<Record<string, string | number>>(),
  // Grading results per question: { questionId: { correct, points, feedback? } }
  gradingResults: jsonb("grading_results").$type<Record<string, { correct: boolean; points: number; feedback?: string }>>(),
  rawScore: integer("raw_score"),
  totalPoints: integer("total_points"),
  percentageScore: numeric("percentage_score"),
  passed: boolean("passed"),
  // AI-generated overall feedback
  aiFeedback: text("ai_feedback"),
  startedAt: timestamp("started_at", { withTimezone: true }).defaultNow().notNull(),
  submittedAt: timestamp("submitted_at", { withTimezone: true }),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  gradedAt: timestamp("graded_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export type AssessmentAttempt = typeof assessmentAttempts.$inferSelect;
export type NewAssessmentAttempt = typeof assessmentAttempts.$inferInsert;

// Predictive psychometric assessments (Big Five, cognitive sample, SJT, EQ,
// DISC, resume↔role match). See migration 0119_predictive_assessments.sql.
// Distinct from `assessmentAttempts` above (skill tests, pass/fail). These
// produce dimension-scored trait profiles, not pass/fail outcomes.
export const assessmentRuns = pgTable("assessment_runs", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  assessmentKind: varchar("assessment_kind", { length: 64 }).notNull(),
  status: varchar("status", { length: 20 }).default("started").notNull(),
  questionIndex: integer("question_index").default(0).notNull(),
  responses: jsonb("responses").default([]).notNull().$type<Array<{ questionId: string; value: string | number }>>(),
  scores: jsonb("scores").$type<{ scores: Record<string, number>; counts: Record<string, number>; overall: number } | null>(),
  results: jsonb("results").$type<{ narrative?: string; topStrength?: string; topGrowth?: string; roleAlignment?: Record<string, number> } | null>(),
  isProRun: boolean("is_pro_run").default(false).notNull(),
  startedAt: timestamp("started_at", { withTimezone: true }).defaultNow().notNull(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export type AssessmentRun = typeof assessmentRuns.$inferSelect;
export type NewAssessmentRun = typeof assessmentRuns.$inferInsert;
