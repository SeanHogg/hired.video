-- Migration: 0014_resume_match_scores
-- Caches the most recent /api/match/analyze result per (user, job, resume)
-- so /api/match/tailor can pick up the score's recommendations without the
-- extension having to echo them back. Overwritten on each re-score.
--
-- Named in parallel to `recruiter_match_scores` (which scores talent-pool
-- candidates). This table scores a user's own resume against a job they've
-- tracked.

CREATE TABLE IF NOT EXISTS "resume_match_scores" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "job_id" uuid NOT NULL REFERENCES "job_items"("id") ON DELETE CASCADE,
  "resume_id" uuid NOT NULL REFERENCES "resume_information"("id") ON DELETE CASCADE,
  "score" integer NOT NULL,
  "recommendations" text NOT NULL DEFAULT '',
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "resume_match_scores_user_job_resume_idx"
  ON "resume_match_scores" ("user_id", "job_id", "resume_id");
