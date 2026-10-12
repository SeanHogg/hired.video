-- 0087 — Inbox quality controls.
--
-- Three shape changes to support the "job-related emails only" inbox:
--
-- 1. external_email_accounts.min_job_score — per-mailbox floor on the
--    classifier confidence required for a message to surface in the
--    inbox feed. Defaults to 0.50; users tune it from Inbox settings.
--    Per-account (not per-user) so a noisy Gmail can be tightened while
--    a high-signal workmail stays loose.
--
-- 2. email_sync_runs.messages_excluded / messages_job_related — record
--    the read-side outcome of each pass so the Sync History sheet can
--    show "12 synced, 9 excluded, 3 job-related, 1 linked, 1 created"
--    without recomputing on read.
--
-- 3. email_sync_runs.rules_fired — jsonb counter (rule_name → count) of
--    which Stage-1 deterministic rules matched during the run. Powers
--    the "Rules applied this run" section in Sync History.
--
-- All columns are nullable / defaulted so the migration is safe to
-- re-run while the loose drizzle runner replays it; existing rows fall
-- back to sane defaults.

ALTER TABLE external_email_accounts
  ADD COLUMN IF NOT EXISTS min_job_score numeric(4,3) NOT NULL DEFAULT 0.500;

ALTER TABLE email_sync_runs
  ADD COLUMN IF NOT EXISTS messages_excluded integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS messages_job_related integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS rules_fired jsonb;
