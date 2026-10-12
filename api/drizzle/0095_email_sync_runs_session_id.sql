-- 0095 — Per-logical-sync aggregation for `email_sync_runs`.
--
-- Closes gap #811: the PWA orchestrator (`runClientSync`) splits one
-- logical sync into N chunked POSTs (20 messages max each). Each POST
-- to `/inbox/external-emails/ingest` was producing zero `email_sync_runs`
-- rows since the cutover from `sync.ts` to the client-driven model
-- (`emailSyncRunsRepository.ts` was read-only); the Sync History sheet
-- therefore showed stale pre-cutover rows full of zeros and the Usage
-- Statement over-counted "sync" events at 1-per-chunk.
--
-- Fix: ingest writes one row per *logical* sync. The client generates
-- a UUID at the start of each sync and stamps every chunk POST with it
-- (`syncSessionId` field). Server upserts the row keyed on
-- `(account_id, sync_session_id)`, summing counters across chunks.
--
-- Unique partial index lets old pre-#811 rows (sync_session_id IS NULL)
-- stay un-constrained — they remain in the table as historical audit,
-- the listing surface just renders them without aggregation.
--
-- Safe to re-run: column is nullable, index uses IF NOT EXISTS.

ALTER TABLE email_sync_runs
  ADD COLUMN IF NOT EXISTS sync_session_id varchar(64);

CREATE UNIQUE INDEX IF NOT EXISTS email_sync_runs_session_unq
  ON email_sync_runs (account_id, sync_session_id)
  WHERE sync_session_id IS NOT NULL;
