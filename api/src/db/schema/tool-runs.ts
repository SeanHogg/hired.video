// tool-runs.ts — Polymorphic history of AI-tool runs against any entity
// (resume, job, video, template, company). One row per run; each run can
// be associated with one or more entities so tools that span entities
// (e.g. Resume Tailor: resume + job) appear in both entities' histories.
//
// Every FK is nullable and cascades on delete so that removing the parent
// entity cleans up its tool-run history automatically.

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
import { resumeInformation, resumeTemplates } from "./resumes.js";
import { jobItems } from "./jobs.js";
import { videos } from "./videos.js";
import { companyProfiles } from "./companies.js";

export const toolRuns = pgTable("tool_runs", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),

  // Stable tool identifier shared with the frontend registry. Free-form so
  // new tools don't need a migration.
  toolId: varchar("tool_id", { length: 100 }).notNull(),

  // Polymorphic entity associations. A run may reference any combination;
  // most tools reference exactly one (single-entity tools) or two
  // (cross-entity tools like Resume Tailor).
  resumeId: uuid("resume_id").references(() => resumeInformation.id, { onDelete: "cascade" }),
  jobId: uuid("job_id").references(() => jobItems.id, { onDelete: "cascade" }),
  videoId: uuid("video_id").references(() => videos.id, { onDelete: "cascade" }),
  templateId: uuid("template_id").references(() => resumeTemplates.id, { onDelete: "cascade" }),
  companyId: uuid("company_id").references(() => companyProfiles.id, { onDelete: "cascade" }),

  // Normalized overall score 0–100 for charting across runs. Null when the
  // tool doesn't produce a single comparable score.
  score: numeric("score"),
  // Full tool result JSON — the frontend re-hydrates the result panel from it.
  result: jsonb("result").notNull().default({}).$type<Record<string, unknown>>(),
  // Short human-readable label for the history list.
  summary: text("summary"),
  // When the tool consumed a pasted job description, store it so the run is
  // self-contained even if the job was never persisted as an entity.
  jobDescription: text("job_description"),

  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  // Per-entity lookups — each powers the history panel for that entity type.
  index("tool_runs_resume_tool_idx").on(table.resumeId, table.toolId, table.createdAt),
  index("tool_runs_job_tool_idx").on(table.jobId, table.toolId, table.createdAt),
  index("tool_runs_video_tool_idx").on(table.videoId, table.toolId, table.createdAt),
  index("tool_runs_template_tool_idx").on(table.templateId, table.toolId, table.createdAt),
  index("tool_runs_company_tool_idx").on(table.companyId, table.toolId, table.createdAt),
  index("tool_runs_user_id_idx").on(table.userId),
]);

export type ToolRun = typeof toolRuns.$inferSelect;
export type NewToolRun = typeof toolRuns.$inferInsert;
