-- #1594 — Data-model audit, batch 3: missing FK constraints.
--
-- Each block has the shape:
--   1. NULL out (or DELETE, where the column is NOT NULL) orphan rows so
--      the FK can be added without failing on bad existing data.
--   2. ALTER TABLE … ADD CONSTRAINT … FOREIGN KEY using a DO block for
--      idempotency (Postgres has no ADD CONSTRAINT IF NOT EXISTS).
--
-- Scope of this migration is the LOW-RISK subset of gap #1595 — FKs that
-- can be added without converting the column type. Out of scope (deferred
-- to a later migration that does the text→uuid type fix at the same time):
--   - studio_voice_clone_licenses.user_id (text)
--   - studio_captions.user_id / project_id (text)
--   - linkedin_accounts.user_id / youtube_accounts.user_id (text)
--   - call_logs.user_id / sms_messages.user_id (text)
--   - boosts.user_id (uuid but type mismatch with users.id when joined via job_boosts)
--   - recruiter.ts jobId text→uuid pairs
--
-- Those land in a follow-up migration once the type-coercion path is
-- audited (gap #1603).
--
-- Closes: partial #1595 (identity + location-link FKs).
--         partial #1601 (account_invitations cascade on company delete).

-- ---------------------------------------------------------------------------
-- accountInvitations.companyId → company_profiles(id) ON DELETE CASCADE.
-- Nullable column (generic platform-role invites don't bind to a
-- company), so orphans become NULL rather than getting deleted.
-- ---------------------------------------------------------------------------

UPDATE account_invitations
SET company_id = NULL
WHERE company_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM company_profiles WHERE company_profiles.id = account_invitations.company_id
  );

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'account_invitations_company_id_fkey'
  ) THEN
    ALTER TABLE account_invitations
      ADD CONSTRAINT account_invitations_company_id_fkey
      FOREIGN KEY (company_id) REFERENCES company_profiles(id) ON DELETE CASCADE;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- sessions.rotatedToSessionId → sessions(id) ON DELETE SET NULL.
-- Self-FK pointing at the successor session in a rotation chain. SET NULL
-- so collapsing an old rotation doesn't cascade-delete the whole chain.
-- ---------------------------------------------------------------------------

UPDATE sessions
SET rotated_to_session_id = NULL
WHERE rotated_to_session_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM sessions s2 WHERE s2.id = sessions.rotated_to_session_id
  );

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'sessions_rotated_to_session_id_fkey'
  ) THEN
    ALTER TABLE sessions
      ADD CONSTRAINT sessions_rotated_to_session_id_fkey
      FOREIGN KEY (rotated_to_session_id) REFERENCES sessions(id) ON DELETE SET NULL;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- user_profiles home_* → countries / state_provinces / cities ON DELETE
-- SET NULL. All three columns are nullable; orphans become NULL.
-- ---------------------------------------------------------------------------

UPDATE user_profiles
SET home_country_id = NULL
WHERE home_country_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM countries WHERE countries.id = user_profiles.home_country_id
  );

UPDATE user_profiles
SET home_state_id = NULL
WHERE home_state_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM state_provinces WHERE state_provinces.id = user_profiles.home_state_id
  );

UPDATE user_profiles
SET home_city_id = NULL
WHERE home_city_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM cities WHERE cities.id = user_profiles.home_city_id
  );

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'user_profiles_home_country_id_fkey'
  ) THEN
    ALTER TABLE user_profiles
      ADD CONSTRAINT user_profiles_home_country_id_fkey
      FOREIGN KEY (home_country_id) REFERENCES countries(id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'user_profiles_home_state_id_fkey'
  ) THEN
    ALTER TABLE user_profiles
      ADD CONSTRAINT user_profiles_home_state_id_fkey
      FOREIGN KEY (home_state_id) REFERENCES state_provinces(id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'user_profiles_home_city_id_fkey'
  ) THEN
    ALTER TABLE user_profiles
      ADD CONSTRAINT user_profiles_home_city_id_fkey
      FOREIGN KEY (home_city_id) REFERENCES cities(id) ON DELETE SET NULL;
  END IF;
END $$;
