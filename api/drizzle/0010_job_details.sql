-- Migration: 0010_job_details
-- Adds a jsonb `details` column to job_items so the Chrome extension's
-- /api/jobs/extract route can persist the structured sections
-- (responsibilities, requirements, qualifications, benefits) it pulls
-- out of the source page via the AI classifier.
--
-- Backwards-compatible: defaults to an empty object so existing rows
-- continue to satisfy NOT NULL on insert without a backfill.

ALTER TABLE "job_items"
  ADD COLUMN IF NOT EXISTS "details" jsonb DEFAULT '{}'::jsonb;
