-- Migration: 0019_resume_tool_runs
-- History of resume-input tool runs per resume (Resume Optimizer, AI Resume
-- Scorer, Resume Tailor, etc.). Lets users see improvement over time and
-- re-open a previous run's result panel without re-computing it.

CREATE TABLE IF NOT EXISTS "resume_tool_runs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "resume_id" uuid NOT NULL REFERENCES "resume_information"("id") ON DELETE CASCADE,
  "tool_id" varchar(100) NOT NULL,
  "score" numeric,
  "result" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "job_description" text,
  "summary" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "resume_tool_runs_resume_id_idx"
  ON "resume_tool_runs" ("resume_id");

CREATE INDEX IF NOT EXISTS "resume_tool_runs_resume_tool_idx"
  ON "resume_tool_runs" ("resume_id", "tool_id", "created_at");

CREATE INDEX IF NOT EXISTS "resume_tool_runs_user_id_idx"
  ON "resume_tool_runs" ("user_id");
