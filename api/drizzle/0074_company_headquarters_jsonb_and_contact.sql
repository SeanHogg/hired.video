-- Reshape company_profiles: headquarters becomes structured (jsonb) and a
-- new contact column is added so the data submitted by CompanyBuilder
-- (city/state/country/postalCode/address/remote on headquarters; email/
-- phone/linkedin/twitter/facebook on contact) actually persists.
--
-- Closes #294 and #295 in the Consolidated Gap Register. Until this
-- shipped, headquarters was varchar(255) silently storing whatever the
-- form submitted, and contact had no column at all so contact data was
-- dropped on every PUT/POST.
--
-- Idempotent: re-running after partial rollout is a no-op. The DO block
-- inspects the current column type so a deploy that already migrated the
-- column on a prior attempt doesn't try to re-cast jsonb to jsonb (which
-- would error on the `headquarters = ''` comparison since you can't
-- compare jsonb to a plain varchar).
--
-- Migration strategy when the column is still varchar(255): every legacy
-- value is treated as a free-text address and wrapped as
-- `{ "address": <text> }`. Address is the only field CompanyDetail reads
-- for legacy rows, and this avoids attempting a JSON parse on text that
-- isn't valid JSON (which is what was failing in the first deploy
-- attempt — `value::jsonb` errors on a string like "Troy, MI").

DO $$
DECLARE
  current_type text;
BEGIN
  SELECT data_type INTO current_type
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'company_profiles'
    AND column_name = 'headquarters';

  IF current_type = 'character varying' OR current_type = 'text' THEN
    ALTER TABLE company_profiles
      ALTER COLUMN headquarters TYPE jsonb
      USING CASE
        WHEN headquarters IS NULL OR headquarters = '' THEN NULL::jsonb
        ELSE jsonb_build_object('address', headquarters)
      END;
  END IF;
END $$;

ALTER TABLE company_profiles ADD COLUMN IF NOT EXISTS contact jsonb NOT NULL DEFAULT '{}'::jsonb;
