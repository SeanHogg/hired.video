-- Migration: 0111_user_deleted_at_do_not_share
--
-- Adds two compliance columns to `users` for gap #1149 (US compliance hardening):
--
--   1. `deleted_at` — set by deleteAccount() when the user requests deletion.
--      Distinguishes "explicitly deleted by user" from `is_active=false`
--      (which is also set by admin deactivation, suspension recovery, etc.).
--      The hard-delete sweep in scheduled.ts only purges rows where
--      deleted_at is non-null AND older than the retention window.
--
--   2. `do_not_share` — CPRA "Do not sell or share my personal information"
--      opt-out flag, settable via /privacy/opt-out without sign-in (token
--      form) or via Settings → Privacy. When true: marketing-pixel install
--      short-circuits, paid-media CAPI fan-out suppresses identifiers,
--      audience export jobs skip the user.
--
-- Idempotent: safe to re-run.

ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "deleted_at" timestamptz,
  ADD COLUMN IF NOT EXISTS "do_not_share" boolean NOT NULL DEFAULT false;

-- Partial index supports the nightly purge sweep without scanning the whole
-- users table — only rows with deleted_at set are candidates.
CREATE INDEX IF NOT EXISTS "idx_users_deleted_at"
  ON "users" ("deleted_at")
  WHERE "deleted_at" IS NOT NULL;
