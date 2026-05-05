-- 0076 — youtube_accounts schema drift fix
--
-- Production drift: the `youtube_accounts` table exists with a stale shape
-- (almost certainly from an early `drizzle-kit push` before the SQL
-- migration in 0043_youtube_connections.sql was authored). The
-- `CREATE TABLE IF NOT EXISTS` guard in 0043 silently skipped the create,
-- so newer columns — most visibly `google_id` — were never applied.
--
-- Symptom on 2026-05-05: `GET /api/youtube/account` returned 500
-- `column "google_id" does not exist`. Drizzle's `select()` includes every
-- mapped column, so the read fails before any row even comes back.
--
-- This migration aligns the production table with the canonical schema in
-- 0043 + `api/src/db/schema/studiofeatures.ts:youtubeAccounts`. Each step
-- is idempotent so re-runs are no-ops.

-- ── 1. Ensure every column from the canonical schema exists ──────────────
ALTER TABLE youtube_accounts ADD COLUMN IF NOT EXISTS google_id        TEXT;
ALTER TABLE youtube_accounts ADD COLUMN IF NOT EXISTS channel_id       TEXT;
ALTER TABLE youtube_accounts ADD COLUMN IF NOT EXISTS channel_title    TEXT;
ALTER TABLE youtube_accounts ADD COLUMN IF NOT EXISTS display_name     TEXT;
ALTER TABLE youtube_accounts ADD COLUMN IF NOT EXISTS email            TEXT;
ALTER TABLE youtube_accounts ADD COLUMN IF NOT EXISTS access_token     TEXT;
ALTER TABLE youtube_accounts ADD COLUMN IF NOT EXISTS refresh_token    TEXT;
ALTER TABLE youtube_accounts ADD COLUMN IF NOT EXISTS token_expires_at TIMESTAMPTZ;
ALTER TABLE youtube_accounts ADD COLUMN IF NOT EXISTS scopes           TEXT;
ALTER TABLE youtube_accounts ADD COLUMN IF NOT EXISTS is_active        BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE youtube_accounts ADD COLUMN IF NOT EXISTS created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE youtube_accounts ADD COLUMN IF NOT EXISTS updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- ── 2. Backfill the strict columns on any pre-existing rows ─────────────
-- Such rows are effectively broken (the upsert path requires both
-- google_id and access_token), but we keep them rather than truncating in
-- case anything still references their refresh_token. The placeholder
-- `unknown_<id>` is unique so the (user_id, google_id) constraint added
-- below cannot conflict.
UPDATE youtube_accounts SET google_id    = 'unknown_' || id::text WHERE google_id    IS NULL;
UPDATE youtube_accounts SET access_token = ''                     WHERE access_token IS NULL;

-- ── 3. Re-assert NOT NULL on the strict columns ──────────────────────────
DO $$ BEGIN
  ALTER TABLE youtube_accounts ALTER COLUMN google_id    SET NOT NULL;
EXCEPTION WHEN others THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE youtube_accounts ALTER COLUMN access_token SET NOT NULL;
EXCEPTION WHEN others THEN NULL;
END $$;

-- ── 4. (user_id, google_id) uniqueness — part of the upsert contract ─────
DO $$ BEGIN
  ALTER TABLE youtube_accounts
    ADD CONSTRAINT youtube_accounts_user_google_id_key UNIQUE (user_id, google_id);
EXCEPTION
  WHEN duplicate_object THEN NULL;
  WHEN duplicate_table  THEN NULL;
END $$;

-- ── 5. Index on user_id (selected on every account lookup) ───────────────
CREATE INDEX IF NOT EXISTS idx_youtube_accounts_user
  ON youtube_accounts (user_id);
