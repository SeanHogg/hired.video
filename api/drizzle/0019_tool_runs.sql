-- Migration: 0019_tool_runs
-- Polymorphic AI-tool run history. Each row records one execution of a
-- tool (from the frontend toolRegistry) and may reference any combination
-- of entities — resume, job, video, template, company — so cross-entity
-- tools (e.g. Resume Tailor: resume + job) show up in both entities'
-- history panels via a single index lookup.
--
-- All entity FKs are nullable and cascade on delete so removing a parent
-- entity cleans up its tool-run history automatically.

-- Drop the earlier resume-only form of this table if it was applied before
-- the polymorphic refactor landed. Safe no-op when the table never existed.
DROP TABLE IF EXISTS "resume_tool_runs";

CREATE TABLE IF NOT EXISTS "tool_runs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "tool_id" varchar(100) NOT NULL,
  "resume_id" uuid REFERENCES "resume_information"("id") ON DELETE CASCADE,
  "job_id" uuid REFERENCES "job_items"("id") ON DELETE CASCADE,
  "video_id" uuid REFERENCES "videos"("id") ON DELETE CASCADE,
  "template_id" uuid REFERENCES "resume_templates"("id") ON DELETE CASCADE,
  "company_id" uuid REFERENCES "company_profiles"("id") ON DELETE CASCADE,
  "score" numeric,
  "result" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "summary" text,
  "job_description" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "tool_runs_resume_tool_idx"
  ON "tool_runs" ("resume_id", "tool_id", "created_at");

CREATE INDEX IF NOT EXISTS "tool_runs_job_tool_idx"
  ON "tool_runs" ("job_id", "tool_id", "created_at");

CREATE INDEX IF NOT EXISTS "tool_runs_video_tool_idx"
  ON "tool_runs" ("video_id", "tool_id", "created_at");

CREATE INDEX IF NOT EXISTS "tool_runs_template_tool_idx"
  ON "tool_runs" ("template_id", "tool_id", "created_at");

CREATE INDEX IF NOT EXISTS "tool_runs_company_tool_idx"
  ON "tool_runs" ("company_id", "tool_id", "created_at");

CREATE INDEX IF NOT EXISTS "tool_runs_user_id_idx"
  ON "tool_runs" ("user_id");
