-- Migration 0136 — Persist SCORM package id on course lessons (#1440).
--
-- The client-side SCORM upload (#1431) mints one `pkgId` (uuid v4) per
-- package and writes every extracted file under
--   `uploads/<userId>/scorm/<pkgId>/<inZipPath>`
-- so relative refs in the entry HTML resolve to real R2 siblings.
-- Returning that pkgId in the upload result lets the lesson editor
-- record it on the row, which lets us prefix-delete the whole package
-- when the lesson is removed — no more orphaned R2 keys.
--
-- Idempotent: ADD COLUMN IF NOT EXISTS so re-runs are safe.

ALTER TABLE course_lessons
  ADD COLUMN IF NOT EXISTS scorm_pkg_id UUID;

-- No index — the column is only ever read in the per-lesson DELETE path,
-- which already has the lesson id and just needs to read this single
-- column to know what R2 prefix to wipe.
