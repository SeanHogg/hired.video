-- Migration: 0015_apply_url
-- Adds a dedicated `apply_url` column to `job_items` so the direct-apply
-- link (extracted from JSON-LD directApply / url fields at track time)
-- is persisted per-job instead of re-derived-or-lost at response time.
--
-- Before: every response had to do `parsed.applyUrl || sourceUrl || undefined`.
-- `parsed.applyUrl` was only ever set during a fresh /extract call; on
-- later views (e.g. /api/jobs/saved), parsed is null, so applyUrl
-- always fell back to sourceUrl — meaning the jobseeker extension's #3
-- Apply button always just re-opened the posting page, even when the
-- posting originally pointed at a Workday/Greenhouse/Lever form.
--
-- After: /extract writes the extracted applyUrl here, rowToJob reads it
-- back, and the /refresh endpoint can detect "applyUrl equals sourceUrl"
-- as the fallback case and update it when a new apply link is found
-- on a re-scan.
--
-- Nullable so existing rows keep working — response-time derivation
-- falls back to sourceUrl when this column is null.

ALTER TABLE "job_items"
  ADD COLUMN IF NOT EXISTS "apply_url" text;
