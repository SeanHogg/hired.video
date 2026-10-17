-- 0632_archive_legacy_profile_columns.sql
--
-- W3-D2 (architecture remediation 2026-10-17). Archive-first copies of the
-- legacy columns 0631 moved to their canonical stores, taken AFTER the
-- backfill (TEMPLATE / remediation plan: copy in a later file than the
-- backfill, drop later still). Nothing reads or writes these columns any more
-- except the GDPR purge, which NULLs them.
--
--   archive.user_profiles_legacy_0632   user_profiles.billing_* + home_*
--                                       (canonical: billing_addresses,
--                                       content_locations 'user_profile')
--   archive.job_preferences_legacy_0632 job_preferences.skills / industries
--                                       (canonical: user_profiles.skills /
--                                       industries; also keeps the values of
--                                       users who have no profile row)
--   archive.users_persona_0632          users.persona where it is not the
--                                       'recruiting' default (dead #104 axis)
--
-- The DROP COLUMN step is a follow-up migration in the NEXT deploy, together
-- with removing the columns' declarations from users.ts / jobs.ts:
-- `drizzle-kit push --force` runs before the SQL migrations, so removing the
-- declarations in this deploy would drop the data before 0631 copied it.
--
-- Idempotent: CREATE TABLE IF NOT EXISTS + ON CONFLICT DO NOTHING; each copy
-- is skipped when its source columns are already gone.

CREATE SCHEMA IF NOT EXISTS archive;

CREATE TABLE IF NOT EXISTS archive.user_profiles_legacy_0632 (
  user_id             uuid PRIMARY KEY,
  billing_full_name   varchar(160),
  billing_company     varchar(160),
  billing_line1       varchar(200),
  billing_line2       varchar(200),
  billing_city        varchar(100),
  billing_state       varchar(100),
  billing_postal_code varchar(20),
  billing_country     varchar(2),
  billing_phone       varchar(40),
  home_country_id     integer,
  home_state_id       uuid,
  home_city_id        uuid,
  home_postal_code    varchar(20),
  home_latitude       double precision,
  home_longitude      double precision,
  home_radius_km      integer,
  archived_at         timestamptz NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'user_profiles' AND column_name = 'billing_line1'
  ) AND EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'user_profiles' AND column_name = 'home_country_id'
  ) THEN
    INSERT INTO archive.user_profiles_legacy_0632 (
      user_id,
      billing_full_name, billing_company, billing_line1, billing_line2, billing_city,
      billing_state, billing_postal_code, billing_country, billing_phone,
      home_country_id, home_state_id, home_city_id, home_postal_code,
      home_latitude, home_longitude, home_radius_km
    )
    SELECT
      up.user_id,
      up.billing_full_name, up.billing_company, up.billing_line1, up.billing_line2, up.billing_city,
      up.billing_state, up.billing_postal_code, up.billing_country, up.billing_phone,
      up.home_country_id, up.home_state_id, up.home_city_id, up.home_postal_code,
      up.home_latitude, up.home_longitude, up.home_radius_km
    FROM public.user_profiles up
    WHERE COALESCE(
      up.billing_full_name, up.billing_company, up.billing_line1, up.billing_line2, up.billing_city,
      up.billing_state, up.billing_postal_code, up.billing_country, up.billing_phone,
      up.home_postal_code
    ) IS NOT NULL
       OR up.home_country_id IS NOT NULL
       OR up.home_state_id IS NOT NULL
       OR up.home_city_id IS NOT NULL
       OR up.home_latitude IS NOT NULL
       OR up.home_longitude IS NOT NULL
       OR up.home_radius_km IS NOT NULL
    ON CONFLICT (user_id) DO NOTHING;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS archive.job_preferences_legacy_0632 (
  user_id     uuid PRIMARY KEY,
  skills      jsonb,
  industries  jsonb,
  archived_at timestamptz NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'job_preferences' AND column_name = 'skills'
  ) THEN
    INSERT INTO archive.job_preferences_legacy_0632 (user_id, skills, industries)
    SELECT jp.user_id, jp.skills, jp.industries
    FROM public.job_preferences jp
    WHERE (jsonb_typeof(jp.skills) = 'array' AND jsonb_array_length(jp.skills) > 0)
       OR (jsonb_typeof(jp.industries) = 'array' AND jsonb_array_length(jp.industries) > 0)
    ON CONFLICT (user_id) DO NOTHING;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS archive.users_persona_0632 (
  user_id     uuid PRIMARY KEY,
  persona     varchar(32),
  archived_at timestamptz NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'persona'
  ) THEN
    INSERT INTO archive.users_persona_0632 (user_id, persona)
    SELECT u.id, u.persona
    FROM public.users u
    WHERE u.persona IS DISTINCT FROM 'recruiting'
    ON CONFLICT (user_id) DO NOTHING;
  END IF;
END $$;
