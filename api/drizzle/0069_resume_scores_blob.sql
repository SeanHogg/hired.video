-- Migration: 0069_resume_scores_blob
--
-- Adds a `scores` JSONB column to resume_information so the AI Resume
-- Scorer (`/api/resumescorer/score`) and Resume Optimizer
-- (`/api/resumeoptimizer/optimize`) can persist their results on the
-- resume row instead of throwing them away every call.
--
-- Shape (validated by ResumeScoresSchema in shared/scores.ts):
--   {
--     overall?: 0..100,
--     ats?:     0..100,
--     content?: 0..100,
--     keyword?: 0..100,
--     format?:  0..100,
--     impact?:  0..100
--   }
--
-- Sentiment lives on its own column (sentiment_score, added in 0022)
-- and stays there — no migration of existing data is required.
--
-- JSONB instead of six integer columns: forward-compatible (new sub-
-- scores added without a schema change), atomic per-update, and we
-- never sort or filter on these in SQL. If any sub-score graduates to
-- a list-page filter it can be promoted to its own column.

ALTER TABLE "resume_information"
  ADD COLUMN IF NOT EXISTS "scores" jsonb;
