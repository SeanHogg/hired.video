-- Migration 0495 — performance indexes + pg_trgm search indexes.
--
-- Every index below is ALSO declared in src/db/schema/*.ts under the same
-- name. That is load-bearing: CI runs `drizzle-kit push --force` BEFORE this
-- runner, and push drops any index on a schema table that the schema doesn't
-- declare. Indexes that only lived in migrations (0060 sessions, 0161 scale
-- covering indexes, 0177 ucra, …) were being dropped on the next deploy and
-- never recreated, because this runner applies each file once. The same pass
-- that adds this file mirrors those legacy migration indexes into the schema
-- so push stops dropping them (and recreates the ones already lost).
--
-- On a normal deploy push has already created everything here by the time
-- this file runs, so each CREATE … IF NOT EXISTS is a no-op; the file exists
-- so a DB bootstrapped from migrations alone ends up in the same shape and so
-- the intent is reviewable in one place.
--
-- DESC columns use Postgres' default NULLS FIRST, matching the schema's
-- `.desc().nullsFirst()` — drizzle-kit push compares nulls ordering, so a
-- mismatch would drop + rebuild the index on every deploy.
--
-- Idempotent: CREATE … IF NOT EXISTS / DROP … IF EXISTS throughout.

-- ---------------------------------------------------------------------------
-- pg_trgm — required by the gin_trgm_ops indexes below. On deploys the
-- extension is created by scripts/ensure-db-extensions.mjs (chained in front
-- of drizzle-kit push in `npm run db:push`) because push creates the trigram
-- indexes before this runner gets a chance. Repeated here for DBs built from
-- migrations alone.
-- ---------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ---------------------------------------------------------------------------
-- Retention-swept telemetry (services/maintenance/retention-sweep.ts). The
-- sweep's `ctid IN (SELECT ctid … WHERE created_at < cutoff ORDER BY
-- created_at LIMIT n)` batch needs a created_at-leading index or every batch
-- is a full sequential scan of a 10M+ row table.
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_request_logs_created
  ON request_logs (created_at);

CREATE INDEX IF NOT EXISTS idx_request_logs_user_created
  ON request_logs (user_id, created_at)
  WHERE user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_activity_logs_created
  ON activity_logs (created_at);

-- notifications: the unread COUNT is already served by the 0161 partial
-- idx_notifications_user_unread (user_id) WHERE is_read = false; this one is
-- for the 90-day retention sweep only.
CREATE INDEX IF NOT EXISTS idx_notifications_created
  ON notifications (created_at);

CREATE INDEX IF NOT EXISTS idx_tool_runs_created
  ON tool_runs (created_at);

CREATE INDEX IF NOT EXISTS idx_tool_runs_user_created
  ON tool_runs (user_id, created_at DESC);

-- (user_id, created_at) makes the single-column 0019 index redundant — pure
-- write cost on the highest-volume append table.
DROP INDEX IF EXISTS tool_runs_user_id_idx;

CREATE INDEX IF NOT EXISTS idx_ai_chat_messages_created
  ON ai_chat_messages (created_at);

-- ---------------------------------------------------------------------------
-- Messaging — inbox fan-out ("my conversations") and unread-receipt lookups
-- had no index on the user side at all.
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_conversation_participants_user
  ON conversation_participants (user_id);

CREATE INDEX IF NOT EXISTS idx_conversation_participants_conversation_user
  ON conversation_participants (conversation_id, user_id);

CREATE INDEX IF NOT EXISTS idx_message_read_receipts_user_message
  ON message_read_receipts (user_id, message_id);

-- ---------------------------------------------------------------------------
-- Auth lookups.
-- ---------------------------------------------------------------------------
-- oauth_accounts: NON-unique on purpose. Concurrent link/login races may
-- already have produced duplicate (provider, provider_account_id) rows, and a
-- UNIQUE index would fail both here and in drizzle-kit push (which runs first
-- and aborts the deploy). Promote to UNIQUE in a follow-up after a dedupe
-- audit (SELECT provider, provider_account_id, count(*) … HAVING count(*) > 1).
CREATE INDEX IF NOT EXISTS idx_oauth_accounts_provider_account
  ON oauth_accounts (provider, provider_account_id);

CREATE INDEX IF NOT EXISTS idx_oauth_accounts_user
  ON oauth_accounts (user_id);

-- api_keys.key_hash is the SHA-256 of a freshly generated random secret, so
-- duplicates can't occur in practice and UNIQUE is safe. Guarded anyway: if a
-- duplicate somehow exists, skip with a WARNING instead of failing the file
-- (the runner would otherwise retry it forever).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM api_keys GROUP BY key_hash HAVING count(*) > 1
  ) THEN
    CREATE UNIQUE INDEX IF NOT EXISTS uq_api_keys_key_hash ON api_keys (key_hash);
  ELSE
    RAISE WARNING '0495: duplicate api_keys.key_hash rows exist — uq_api_keys_key_hash not created; dedupe and re-run';
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_api_keys_user
  ON api_keys (user_id);

CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user
  ON refresh_tokens (user_id);

CREATE INDEX IF NOT EXISTS idx_two_factor_codes_user
  ON two_factor_codes (user_id);

CREATE INDEX IF NOT EXISTS idx_password_history_user_created
  ON password_history (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_user_roles_user
  ON user_roles (user_id);

-- ---------------------------------------------------------------------------
-- sessions — device list (newest first) + multi-account fingerprint check
-- (pointsRepository fraud sweep) + the retention-delete FK path.
-- idx_sessions_last_seen is dropped: no
-- query filters or sorts on last_seen_at, and every debounced last-seen
-- touch paid to maintain it.
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_sessions_user_created
  ON sessions (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_sessions_device_fingerprint
  ON sessions (device_fingerprint)
  WHERE device_fingerprint IS NOT NULL;

-- The 0060/0144 self-FK on rotated_to_session_id is ON DELETE SET NULL; with
-- no index, every session row the new 30-day retention policy deletes forces
-- a sequential scan of sessions to null out its predecessor's pointer.
CREATE INDEX IF NOT EXISTS idx_sessions_rotated_to
  ON sessions (rotated_to_session_id)
  WHERE rotated_to_session_id IS NOT NULL;

DROP INDEX IF EXISTS idx_sessions_last_seen;

-- ---------------------------------------------------------------------------
-- "List my X newest first" composites (CONVENTIONS.md → Indexes).
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_videos_user_created
  ON videos (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_talent_pool_candidates_recruiter_added
  ON talent_pool_candidates (recruiter_id, added_at DESC);

CREATE INDEX IF NOT EXISTS idx_placements_recruiter_created
  ON placements (recruiter_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_affiliate_conversions_affiliate_created
  ON affiliate_conversions (affiliate_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_affiliate_referrals_affiliate_created
  ON affiliate_referrals (affiliate_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- Reverse-side FK lookups that had no index.
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_user_connections_to_user
  ON user_connections (to_user_id);

CREATE INDEX IF NOT EXISTS idx_company_followers_company
  ON company_followers (company_id);

CREATE INDEX IF NOT EXISTS idx_company_followers_user
  ON company_followers (user_id);

CREATE INDEX IF NOT EXISTS idx_saved_jobs_job
  ON saved_jobs (job_id);

CREATE INDEX IF NOT EXISTS idx_job_alerts_user
  ON job_alerts (user_id);

CREATE INDEX IF NOT EXISTS idx_follow_up_sequences_user
  ON follow_up_sequences (user_id);

CREATE INDEX IF NOT EXISTS idx_follow_up_steps_sequence
  ON follow_up_steps (sequence_id);

CREATE INDEX IF NOT EXISTS idx_availability_slots_user
  ON availability_slots (user_id);

-- ---------------------------------------------------------------------------
-- job_items — poster lookup + the default public list (active, not
-- archived, newest first). The latter supersedes the 0128 single-column
-- partial idx_job_items_archived_at_null.
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_job_items_posted_by
  ON job_items (posted_by_user_id);

CREATE INDEX IF NOT EXISTS idx_job_items_active_created
  ON job_items (is_active, created_at DESC)
  WHERE archived_at IS NULL;

DROP INDEX IF EXISTS idx_job_items_archived_at_null;

-- ---------------------------------------------------------------------------
-- Trigram search. The search paths use `ILIKE '%term%'` on the raw column
-- (jobsRepository / JobService, usersRepository / admin / search routes,
-- companiesRepository / search, locations city typeahead), which a btree
-- can't serve; gin_trgm_ops on the raw column serves ILIKE directly.
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_job_items_title_trgm
  ON job_items USING gin (title gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_job_items_company_trgm
  ON job_items USING gin (company gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_users_email_trgm
  ON users USING gin (email gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_users_name_trgm
  ON users USING gin (name gin_trgm_ops);

-- @mention resolution: WHERE lower(name) IN (...)
CREATE INDEX IF NOT EXISTS idx_users_name_lower
  ON users USING btree (lower(name));

CREATE INDEX IF NOT EXISTS idx_company_profiles_name_trgm
  ON company_profiles USING gin (name gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_cities_name_trgm
  ON cities USING gin (name gin_trgm_ops);

-- ---------------------------------------------------------------------------
-- Redundant legacy indexes. Each is a strict duplicate / prefix of another
-- index on the same table, so it was intentionally NOT mirrored into the
-- schema (push would drop it anyway); dropped here so the intent is explicit.
-- ---------------------------------------------------------------------------
-- duplicate of idx_gig_milestones_project_ordinal (project_id, ordinal)
DROP INDEX IF EXISTS idx_gig_milestones_project;
-- duplicate of idx_gig_bids_project_status (project_id, status)
DROP INDEX IF EXISTS idx_gig_bids_project;
-- prefix of idx_invoices_recipient_company_status (same partial predicate)
DROP INDEX IF EXISTS idx_invoices_recipient_company;
-- prefix of idx_account_invitations_company_status
DROP INDEX IF EXISTS idx_account_invitations_company;
-- prefix of idx_resume_information_user_updated (same partial predicate)
DROP INDEX IF EXISTS idx_resume_information_archived_at_null;
-- duplicate of the users.external_public_handle UNIQUE constraint index
DROP INDEX IF EXISTS users_external_public_handle_idx;
-- duplicate of reference_shares_token_uniq (now declared in the schema)
DROP INDEX IF EXISTS reference_shares_token_idx;
