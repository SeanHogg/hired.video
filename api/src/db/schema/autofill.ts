import {
  pgTable,
  uuid,
  text,
  varchar,
  timestamp,
  jsonb,
  integer,
  unique,
  index,
} from "drizzle-orm/pg-core";
import { users } from "./users.js";
import { jobItems, savedJobs } from "./jobs.js";
import { resumeInformation } from "./resumes.js";

/**
 * Stores each set of form answers generated/submitted for a job application.
 * Links to the job, saved job pipeline entry, and resume used.
 */
export const applicationFormAnswers = pgTable("application_form_answers", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  jobId: uuid("job_id").references(() => jobItems.id, {
    onDelete: "set null",
  }),
  savedJobId: uuid("saved_job_id").references(() => savedJobs.id, {
    onDelete: "set null",
  }),
  resumeId: uuid("resume_id").references(() => resumeInformation.id, {
    onDelete: "set null",
  }),
  sourceUrl: text("source_url"),
  atsProvider: varchar("ats_provider", { length: 50 }),
  /** The extracted FormField[] array */
  formFields: jsonb("form_fields").notNull().default([]),
  /** The generated { fieldId: answer } map */
  answers: jsonb("answers").notNull().default({}),
  /** Snapshot of the job description used for generation */
  jobDescription: text("job_description"),
  /** draft | submitted | reviewed */
  status: varchar("status", { length: 50 }).default("draft").notNull(),
  submittedAt: timestamp("submitted_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
}, (t) => [
  index("idx_application_form_answers_job_id").on(t.jobId),
  index("idx_application_form_answers_resume_id").on(t.resumeId),
  index("idx_application_form_answers_saved_job_id").on(t.savedJobId),
  index("idx_application_form_answers_user_id").on(t.userId),
]);

export type ApplicationFormAnswer =
  typeof applicationFormAnswers.$inferSelect;
export type NewApplicationFormAnswer =
  typeof applicationFormAnswers.$inferInsert;

/**
 * Caches reusable answers to common application questions per user.
 * Avoids re-running the LLM for identical questions across applications.
 * Keyed by SHA-256 hash of the normalized question text.
 */
export const answerCache = pgTable(
  "answer_cache",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** SHA-256 of normalized question text */
    questionHash: varchar("question_hash", { length: 64 }).notNull(),
    /** Original question text for display */
    questionText: text("question_text").notNull(),
    /** Semantic category: personal_info, motivation, experience, etc. */
    questionCategory: varchar("question_category", { length: 100 }),
    answer: text("answer").notNull(),
    timesUsed: integer("times_used").default(1).notNull(),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [unique("answer_cache_user_question").on(table.userId, table.questionHash)]
);

export type AnswerCacheEntry = typeof answerCache.$inferSelect;
export type NewAnswerCacheEntry = typeof answerCache.$inferInsert;
