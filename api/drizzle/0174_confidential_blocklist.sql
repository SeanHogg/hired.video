-- Migration 0174 — Confidential-mode employer blocklist (#1679), the
-- viewer-company-aware deeper half of confidential search (#1627 / 0169).
--
-- 0169 made confidential profiles fail-closed-invisible in PUBLIC search.
-- This lets an exec stay VISIBLE to recruiters generally while being
-- hidden from specifically-named companies (their current employer /
-- competitors): the authenticated recruiter search excludes a candidate
-- when the VIEWER's company appears in that candidate's blocklist.
--
-- Stored as a jsonb array of company-name strings. Idempotent.

ALTER TABLE "user_profiles"
  ADD COLUMN IF NOT EXISTS "confidential_blocklist" jsonb NOT NULL DEFAULT '[]'::jsonb;
