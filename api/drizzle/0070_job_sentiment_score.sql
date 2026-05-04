-- Migration: 0070_job_sentiment_score
--
-- Adds sentiment_score to job_items so the Sentiment Analysis tool can
-- score saved jobs (recruiter / candidate context: tone of a job
-- posting), mirroring resume_information.sentiment_score added in 0022.
--
-- Persistence rule (matches the resume side, see services/resume/persist-scores.ts):
--   • When the user runs the tool against a SAVED job (jobId given),
--     write here AND record a tool run row.
--   • When the user runs the tool against pasted job-description text
--     (no jobId), the score lives only in tool_runs — never on a job
--     row — because there's no canonical artifact to attach it to.

ALTER TABLE "job_items"
  ADD COLUMN IF NOT EXISTS "sentiment_score" integer;
