-- 0631_profile_billing_geo_skills_single_store.sql
--
-- W3-D2 (architecture remediation 2026-10-17): user_profiles carried three
-- copies of data whose canonical home is elsewhere. This file creates /
-- fills the canonical stores; the code switched to them in the same change.
--
--   1. Billing address — nine user_profiles.billing_* columns → the new
--      billing-domain table `billing_addresses` (one row per user; schema in
--      api/src/db/schema/billingAddresses.ts, read/written only by
--      repositories/billingAddressRepository.ts).
--   2. Home location — seven user_profiles.home_* columns duplicated the
--      `content_locations` origin row for entity_kind 'user_profile'
--      (entity_id = users.id), which the LocationPicker has written since
--      0108/0109 while nothing wrote home_* again. Readers (map pins, ad
--      targeting) now join content_locations; any profile whose home_* has
--      no origin row yet gets one here (dangling FK ids → NULL).
--   3. Skills / industries — job_preferences.skills / .industries (never
--      written by app code; only ad targeting read skills) are merged into
--      user_profiles.skills / .industries, the single store every profile,
--      search, Career 360 and targeting path reads. Case-insensitive dedupe,
--      profile order first. Users with no user_profiles row are not given
--      one (that would publish a profile); their values are kept by 0632.
--
-- Idempotent: CREATE … IF NOT EXISTS, ON CONFLICT DO NOTHING, and the merge
-- is a fixed point. Each backfill is skipped when its source columns are
-- already gone (a later migration drops them). The legacy columns are
-- archived by 0632 and dropped by a follow-up once their schema declarations
-- can be removed (push runs before the SQL migrations).

-- 1. billing_addresses -------------------------------------------------------
CREATE TABLE IF NOT EXISTS billing_addresses (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL,
  full_name   varchar(160),
  company     varchar(160),
  line1       varchar(200),
  line2       varchar(200),
  city        varchar(100),
  state       varchar(100),
  postal_code varchar(20),
  country     varchar(2),
  phone       varchar(40),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'billing_addresses_user_id_unique') THEN
    ALTER TABLE billing_addresses ADD CONSTRAINT billing_addresses_user_id_unique UNIQUE (user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'billing_addresses_user_id_users_id_fk') THEN
    ALTER TABLE billing_addresses ADD CONSTRAINT billing_addresses_user_id_users_id_fk
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'user_profiles' AND column_name = 'billing_line1'
  ) THEN
    INSERT INTO billing_addresses (
      user_id, full_name, company, line1, line2, city, state, postal_code, country, phone, updated_at
    )
    SELECT
      up.user_id, up.billing_full_name, up.billing_company, up.billing_line1, up.billing_line2,
      up.billing_city, up.billing_state, up.billing_postal_code, up.billing_country, up.billing_phone,
      up.updated_at
    FROM user_profiles up
    WHERE COALESCE(
      up.billing_full_name, up.billing_company, up.billing_line1, up.billing_line2, up.billing_city,
      up.billing_state, up.billing_postal_code, up.billing_country, up.billing_phone
    ) IS NOT NULL
    ON CONFLICT (user_id) DO NOTHING;
  END IF;
END $$;

-- 2. Home location → content_locations ---------------------------------------
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'user_profiles' AND column_name = 'home_country_id'
  ) THEN
    INSERT INTO content_locations (
      entity_kind, entity_id, role,
      country_id, state_id, city_id,
      postal_code, latitude, longitude, radius_km
    )
    SELECT
      'user_profile', up.user_id, 'origin',
      co.id, sp.id, ci.id,
      up.home_postal_code, up.home_latitude, up.home_longitude, up.home_radius_km
    FROM user_profiles up
    LEFT JOIN countries co       ON co.id = up.home_country_id
    LEFT JOIN state_provinces sp ON sp.id = up.home_state_id
    LEFT JOIN cities ci          ON ci.id = up.home_city_id
    WHERE up.home_country_id IS NOT NULL
       OR up.home_state_id IS NOT NULL
       OR up.home_city_id IS NOT NULL
       OR up.home_postal_code IS NOT NULL
       OR up.home_latitude IS NOT NULL
       OR up.home_longitude IS NOT NULL
    ON CONFLICT (entity_kind, entity_id) WHERE role = 'origin' DO NOTHING;
  END IF;
END $$;

-- 3. job_preferences.skills / industries → user_profiles ---------------------
-- Ordered, case-insensitive union of two JSON string arrays (non-arrays and
-- non-string elements are ignored). Helper per TEMPLATE.md rule 6.
CREATE OR REPLACE FUNCTION public.__mig_0631_merge_text_arrays(a jsonb, b jsonb)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
AS $func$
  SELECT COALESCE(jsonb_agg(to_jsonb(d.v) ORDER BY d.ord), '[]'::jsonb)
  FROM (
    SELECT DISTINCT ON (lower(trim(x.v))) trim(x.v) AS v, x.ord
    FROM (
      SELECT e.value #>> '{}' AS v, e.ord
      FROM jsonb_array_elements(CASE WHEN jsonb_typeof(a) = 'array' THEN a ELSE '[]'::jsonb END)
        WITH ORDINALITY AS e(value, ord)
      WHERE jsonb_typeof(e.value) = 'string'
      UNION ALL
      SELECT e.value #>> '{}', 1000000 + e.ord
      FROM jsonb_array_elements(CASE WHEN jsonb_typeof(b) = 'array' THEN b ELSE '[]'::jsonb END)
        WITH ORDINALITY AS e(value, ord)
      WHERE jsonb_typeof(e.value) = 'string'
    ) x
    WHERE length(trim(x.v)) > 0
    ORDER BY lower(trim(x.v)), x.ord
  ) d
$func$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'job_preferences' AND column_name = 'skills'
  ) THEN
    UPDATE user_profiles up
    SET skills     = public.__mig_0631_merge_text_arrays(up.skills, jp.skills),
        industries = public.__mig_0631_merge_text_arrays(up.industries, jp.industries),
        updated_at = now()
    FROM job_preferences jp
    WHERE jp.user_id = up.user_id
      AND (
        (jsonb_typeof(jp.skills) = 'array' AND jsonb_array_length(jp.skills) > 0)
        OR (jsonb_typeof(jp.industries) = 'array' AND jsonb_array_length(jp.industries) > 0)
      )
      -- Only rows where job_preferences adds a value the profile lacks (a
      -- profile is never rewritten just to normalize its own array).
      AND (
        public.__mig_0631_merge_text_arrays(up.skills, jp.skills)
          IS DISTINCT FROM public.__mig_0631_merge_text_arrays(up.skills, '[]'::jsonb)
        OR public.__mig_0631_merge_text_arrays(up.industries, jp.industries)
          IS DISTINCT FROM public.__mig_0631_merge_text_arrays(up.industries, '[]'::jsonb)
      );
  END IF;
END $$;

DROP FUNCTION IF EXISTS public.__mig_0631_merge_text_arrays(jsonb, jsonb);
