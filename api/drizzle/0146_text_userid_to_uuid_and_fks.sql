-- #1603 + remainder of #1595 — text user_id / project_id / voice_clone_id
-- columns get converted to uuid + given the missing FK constraints.
--
-- Scope explicitly excludes the actively-used surfaces (inbox integrations,
-- account profiles, resumes, studio templates) — those columns were already
-- uuid-typed. This migration covers the operational/inactive surfaces:
-- phone family, studio voice clones + licences + captions, LinkedIn /
-- YouTube account links.
--
-- Pattern per table:
--   1. DELETE rows whose text user_id isn't a valid UUID (orphans by
--      definition — users.id is uuid so nothing valid joins back).
--   2. ALTER COLUMN TYPE … USING …::uuid (NULLIF guards empty strings).
--   3. ADD CONSTRAINT … FOREIGN KEY … REFERENCES users(id) ON DELETE
--      CASCADE, via DO block for idempotency.
--
-- Closes #1603 and the FK-half of #1595's "still open" list.

-- ---------------------------------------------------------------------------
-- Phone family — five tables that all reference users.user_id as text.
-- ---------------------------------------------------------------------------

DELETE FROM business_phone_numbers
WHERE user_id IS NULL
   OR user_id !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
   OR NOT EXISTS (SELECT 1 FROM users WHERE users.id::text = business_phone_numbers.user_id);

ALTER TABLE business_phone_numbers
  ALTER COLUMN user_id TYPE uuid USING NULLIF(user_id, '')::uuid;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'business_phone_numbers_user_id_fkey') THEN
    ALTER TABLE business_phone_numbers
      ADD CONSTRAINT business_phone_numbers_user_id_fkey
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
  END IF;
END $$;

-- call_logs
DELETE FROM call_logs
WHERE user_id IS NULL
   OR user_id !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
   OR NOT EXISTS (SELECT 1 FROM users WHERE users.id::text = call_logs.user_id);

ALTER TABLE call_logs
  ALTER COLUMN user_id TYPE uuid USING NULLIF(user_id, '')::uuid;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'call_logs_user_id_fkey') THEN
    ALTER TABLE call_logs
      ADD CONSTRAINT call_logs_user_id_fkey
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
  END IF;
END $$;

-- sms_messages
DELETE FROM sms_messages
WHERE user_id IS NULL
   OR user_id !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
   OR NOT EXISTS (SELECT 1 FROM users WHERE users.id::text = sms_messages.user_id);

ALTER TABLE sms_messages
  ALTER COLUMN user_id TYPE uuid USING NULLIF(user_id, '')::uuid;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'sms_messages_user_id_fkey') THEN
    ALTER TABLE sms_messages
      ADD CONSTRAINT sms_messages_user_id_fkey
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
  END IF;
END $$;

-- phone_balances
DELETE FROM phone_balances
WHERE user_id IS NULL
   OR user_id !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
   OR NOT EXISTS (SELECT 1 FROM users WHERE users.id::text = phone_balances.user_id);

ALTER TABLE phone_balances
  ALTER COLUMN user_id TYPE uuid USING NULLIF(user_id, '')::uuid;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'phone_balances_user_id_fkey') THEN
    ALTER TABLE phone_balances
      ADD CONSTRAINT phone_balances_user_id_fkey
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
  END IF;
END $$;

-- phone_balance_transactions
DELETE FROM phone_balance_transactions
WHERE user_id IS NULL
   OR user_id !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
   OR NOT EXISTS (SELECT 1 FROM users WHERE users.id::text = phone_balance_transactions.user_id);

ALTER TABLE phone_balance_transactions
  ALTER COLUMN user_id TYPE uuid USING NULLIF(user_id, '')::uuid;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'phone_balance_transactions_user_id_fkey') THEN
    ALTER TABLE phone_balance_transactions
      ADD CONSTRAINT phone_balance_transactions_user_id_fkey
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- Studio voice clones + licences + captions
-- ---------------------------------------------------------------------------

-- studio_voice_clones.user_id text → uuid + FK
DELETE FROM studio_voice_clones
WHERE user_id IS NULL
   OR user_id !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
   OR NOT EXISTS (SELECT 1 FROM users WHERE users.id::text = studio_voice_clones.user_id);

ALTER TABLE studio_voice_clones
  ALTER COLUMN user_id TYPE uuid USING NULLIF(user_id, '')::uuid;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'studio_voice_clones_user_id_fkey') THEN
    ALTER TABLE studio_voice_clones
      ADD CONSTRAINT studio_voice_clones_user_id_fkey
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
  END IF;
END $$;

-- studio_voice_clone_licenses.user_id text → uuid + FK
DELETE FROM studio_voice_clone_licenses
WHERE user_id IS NULL
   OR user_id !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
   OR NOT EXISTS (SELECT 1 FROM users WHERE users.id::text = studio_voice_clone_licenses.user_id);

-- Same row may also have a stale voice_clone_id (already uuid-typed but
-- never FK-checked). Drop those orphans before adding the FK below.
DELETE FROM studio_voice_clone_licenses
WHERE NOT EXISTS (
  SELECT 1 FROM studio_voice_clones WHERE studio_voice_clones.id = studio_voice_clone_licenses.voice_clone_id
);

ALTER TABLE studio_voice_clone_licenses
  ALTER COLUMN user_id TYPE uuid USING NULLIF(user_id, '')::uuid;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'studio_voice_clone_licenses_user_id_fkey') THEN
    ALTER TABLE studio_voice_clone_licenses
      ADD CONSTRAINT studio_voice_clone_licenses_user_id_fkey
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'studio_voice_clone_licenses_voice_clone_id_fkey') THEN
    ALTER TABLE studio_voice_clone_licenses
      ADD CONSTRAINT studio_voice_clone_licenses_voice_clone_id_fkey
      FOREIGN KEY (voice_clone_id) REFERENCES studio_voice_clones(id) ON DELETE CASCADE;
  END IF;
END $$;

-- studio_captions.user_id + project_id text → uuid + FKs
DELETE FROM studio_captions
WHERE user_id IS NULL
   OR user_id !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
   OR project_id IS NULL
   OR project_id !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
   OR NOT EXISTS (SELECT 1 FROM users WHERE users.id::text = studio_captions.user_id)
   OR NOT EXISTS (SELECT 1 FROM studio_projects WHERE studio_projects.id::text = studio_captions.project_id);

ALTER TABLE studio_captions
  ALTER COLUMN user_id    TYPE uuid USING NULLIF(user_id, '')::uuid,
  ALTER COLUMN project_id TYPE uuid USING NULLIF(project_id, '')::uuid;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'studio_captions_user_id_fkey') THEN
    ALTER TABLE studio_captions
      ADD CONSTRAINT studio_captions_user_id_fkey
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'studio_captions_project_id_fkey') THEN
    ALTER TABLE studio_captions
      ADD CONSTRAINT studio_captions_project_id_fkey
      FOREIGN KEY (project_id) REFERENCES studio_projects(id) ON DELETE CASCADE;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- linkedin_accounts / youtube_accounts — OAuth account-link tables.
-- Both are non-active surfaces (per scope-limit conversation). user_id
-- text → uuid + FK.
-- ---------------------------------------------------------------------------

DELETE FROM linkedin_accounts
WHERE user_id IS NULL
   OR user_id !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
   OR NOT EXISTS (SELECT 1 FROM users WHERE users.id::text = linkedin_accounts.user_id);

ALTER TABLE linkedin_accounts
  ALTER COLUMN user_id TYPE uuid USING NULLIF(user_id, '')::uuid;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'linkedin_accounts_user_id_fkey') THEN
    ALTER TABLE linkedin_accounts
      ADD CONSTRAINT linkedin_accounts_user_id_fkey
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
  END IF;
END $$;

DELETE FROM youtube_accounts
WHERE user_id IS NULL
   OR user_id !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
   OR NOT EXISTS (SELECT 1 FROM users WHERE users.id::text = youtube_accounts.user_id);

ALTER TABLE youtube_accounts
  ALTER COLUMN user_id TYPE uuid USING NULLIF(user_id, '')::uuid;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'youtube_accounts_user_id_fkey') THEN
    ALTER TABLE youtube_accounts
      ADD CONSTRAINT youtube_accounts_user_id_fkey
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
  END IF;
END $$;
