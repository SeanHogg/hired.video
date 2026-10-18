-- Migration 0652 — age-column indexes for the retention-sweep policies added
-- in services/maintenance/retention-policies.ts (2026-10-17).
--
-- The sweep deletes in ctid batches: SELECT ctid … WHERE <age col> < cutoff
-- [AND <scope>] ORDER BY <age col> LIMIT n. Each batch must be an index range
-- scan on the age column, not a full-table sort, so every new policy gets an
-- index leading with its age column. Policies with a status/active scope get
-- a PARTIAL index whose predicate is textually identical to the scope, so the
-- planner can prove the scope implies it.
--
-- Every index below is ALSO declared in src/db/schema/*.ts under the same
-- name and predicate — CI's `drizzle-kit push` drops undeclared indexes. On a
-- normal deploy push has already created them, so each CREATE … IF NOT EXISTS
-- here is a no-op; the file keeps a migrations-only bootstrap in the same
-- shape.
--
-- Idempotent: CREATE INDEX IF NOT EXISTS throughout.

CREATE INDEX IF NOT EXISTS idx_studio_video_heatmap_created_at
  ON studio_video_heatmap (created_at);

CREATE INDEX IF NOT EXISTS idx_enrichment_provider_calls_created_at
  ON enrichment_provider_calls (created_at);

CREATE INDEX IF NOT EXISTS idx_recruiter_agent_runs_created_at
  ON recruiter_agent_runs (created_at);

CREATE INDEX IF NOT EXISTS idx_inbox_action_runs_created_at
  ON inbox_action_runs (created_at);

CREATE INDEX IF NOT EXISTS idx_email_sync_runs_started_at
  ON email_sync_runs (started_at);

CREATE INDEX IF NOT EXISTS idx_paid_media_sync_runs_created_at
  ON paid_media_sync_runs (created_at);

CREATE INDEX IF NOT EXISTS idx_job_board_sync_log_started_at
  ON job_board_sync_log (started_at);

CREATE INDEX IF NOT EXISTS idx_account_locks_unlocked_at
  ON account_locks (unlocked_at)
  WHERE active = false;

CREATE INDEX IF NOT EXISTS idx_email_change_requests_expires_at
  ON email_change_requests (expires_at);

CREATE INDEX IF NOT EXISTS idx_impersonation_sessions_ended_at
  ON impersonation_sessions (ended_at)
  WHERE ended_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_queue_job_to_process_terminal_updated
  ON queue_job_to_process (updated_at)
  WHERE status IN ('completed', 'failed');

CREATE INDEX IF NOT EXISTS idx_social_publish_jobs_terminal_updated
  ON social_publish_jobs (updated_at)
  WHERE status IN ('failed', 'cancelled', 'expired');
