-- Migration 0498 — résumé versions remember when they last took their
-- master's content in (/build "Pull into this version", gap #2325).
--
-- A version is STALE when its master's updated_at is later than this
-- (falling back to the version's created_at for rows made before the
-- column existed). Written ONLY by api/src/services/resume/lineage.ts:
-- when a version is saved from the master, and when the person pulls the
-- master's changes into it. Null on masters / standalone résumés.
-- Idempotent: IF NOT EXISTS.

ALTER TABLE resume_information
  ADD COLUMN IF NOT EXISTS master_synced_at timestamptz;
