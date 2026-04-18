// resume-tool-runs.ts — History of resume-input tool runs per resume.
//
// Every time a user runs a resume-input tool (Resume Optimizer, AI Resume
// Scorer, Resume Tailor, etc.) against one of their own resumes we persist
// the full result here so the user can see their progression over time
// and re-view a past run without re-computing it.

import {
  pgTable,
  uuid,
  text,
  varchar,
  timestamp,
  jsonb,
  numeric,
  index,
} from "drizzle-orm/pg-core";
import { users } from "./users.js";
import { resumeInformation } from "./resumes.js";

export const resumeToolRuns = pgTable("resume_tool_runs", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  resumeId: uuid("resume_id").notNull().references(() => resumeInformation.id, { onDelete: "cascade" }),
  // Stable tool identifier shared with the frontend registry (e.g.
  // "ai-resume-scorer"). Free-form so new tools don't need a migration.
  toolId: varchar("tool_id", { length: 100 }).notNull(),
  // Normalized overall score 0–100 for charting across runs. Null when the
  // tool doesn't produce a single comparable score (e.g. SummarizeResume).
  score: numeric("score"),
  // Full tool result JSON — the frontend re-hydrates the result panel from it.
  result: jsonb("result").notNull().default({}).$type<Record<string, unknown>>(),
  // Optional job description used at run time (Resume Tailor, Job-Resume Match).
  jobDescription: text("job_description"),
  // Short human-readable label for the history list.
  summary: text("summary"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index("resume_tool_runs_resume_id_idx").on(table.resumeId),
  index("resume_tool_runs_resume_tool_idx").on(table.resumeId, table.toolId, table.createdAt),
  index("resume_tool_runs_user_id_idx").on(table.userId),
]);

export type ResumeToolRun = typeof resumeToolRuns.$inferSelect;
export type NewResumeToolRun = typeof resumeToolRuns.$inferInsert;
