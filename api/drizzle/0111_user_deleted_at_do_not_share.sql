-- Migration: 0111_user_deleted_at_do_not_share
--
-- Adds two compliance columns to `users` for gap #1149 (US compliance hardening):
--
--   1. `deleted_at` — audit timestamp set by deleteAccount() when a user
--      explicitly requests deletion. Distinct from `is_active=false` (which
--      also covers admin deactivation, suspension recovery, etc.).
--      Deletion is implemented as ANONYMIZE + MAKE PRIVATE, NOT as a row
--      hard-delete: deleteAccount() scrambles PII fields on `users` /
--      `user_profiles`, flips `videos.privacy_status` and
--      `user_profiles.profile_visibility` to `private`, and stamps this
--      column for audit. No scheduled sweep purges rows — hard delete is
--      reserved for manual data-subject requests handled by the DPO.
--
--   2. `do_not_share` — CPRA "Do not sell or share my personal information"
--      opt-out flag, settable via /privacy/opt-out (token form for
--      unauthenticated requests) or via Settings → Privacy. When true:
--      marketing-pixel install short-circuits, paid-media CAPI fan-out
--      suppresses identifiers, audience export jobs skip the user.
--
-- Idempotent: safe to re-run.

ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "deleted_at" timestamptz,
  ADD COLUMN IF NOT EXISTS "do_not_share" boolean NOT NULL DEFAULT false;
