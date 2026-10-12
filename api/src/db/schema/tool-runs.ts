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
  integer,
  index,
} from "drizzle-orm/pg-core";
import { users } from "./users.js";
import { resumeInformation, studioProjects } from "./resumes.js";
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
  // A studio template (studio_templates.id) — soft link. 0531 drops
  // `resume_templates` and adds tool_runs.template_id → studio_templates(id)
  // ON DELETE CASCADE in SQL (orphan-clean first). Do NOT add
  // `.references(() => studioTemplates.id)` in this same deploy: push runs
  // before SQL and would try the FK before orphans are nulled. Next deploy
  // after 0531 has applied: declare the reference so push keeps the FK.
  templateId: uuid("template_id"),
  companyId: uuid("company_id").references(() => companyProfiles.id, { onDelete: "cascade" }),
  // The studio session (/studio/<id>) the run belongs to (mig 0510): a run
  // made in a session lives as long as the session (cascade) and is exempt
  // from the 90-day retention sweep; reopening the session reloads it.
  studioProjectId: uuid("studio_project_id").references(() => studioProjects.id, { onDelete: "cascade" }),

  // Normalized overall score 0–100 for charting across runs. Null when the
  // tool doesn't produce a single comparable score.
  score: numeric("score"),
  // Total AI tokens the run consumed. Summed across every LLM call the
  // run made (tools that chain multiple calls accumulate). Null/0 for
  // deterministic tools that don't hit an LLM. Updated by `tokenLedger.charge`
  // when the aiCall orchestrator is passed this run's id.
  tokensUsed: integer("tokens_used").default(0),
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
  index("tool_runs_studio_project_tool_idx").on(table.studioProjectId, table.toolId, table.createdAt),
  // Retention sweep range scan + per-user history newest-first (0495). The
  // (user_id, created_at) composite supersedes the old tool_runs_user_id_idx.
  index("idx_tool_runs_created").on(table.createdAt),
  index("idx_tool_runs_user_created").on(table.userId, table.createdAt.desc().nullsFirst()),
]);

export type ToolRun = typeof toolRuns.$inferSelect;
export type NewToolRun = typeof toolRuns.$inferInsert;
