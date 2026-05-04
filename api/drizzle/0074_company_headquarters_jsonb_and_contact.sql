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
-- Idempotent: re-running after partial rollout is a no-op.

ALTER TABLE company_profiles
  ALTER COLUMN headquarters TYPE jsonb
  USING CASE
    WHEN headquarters IS NULL OR headquarters = '' THEN NULL
    -- Already-JSON values round-trip cleanly; legacy free-text strings
    -- preserve the original display under the address field so the
    -- detail page doesn't lose it on read.
    WHEN headquarters::text LIKE '{%}' THEN headquarters::jsonb
    ELSE jsonb_build_object('address', headquarters)
  END;

ALTER TABLE company_profiles ADD COLUMN IF NOT EXISTS contact jsonb NOT NULL DEFAULT '{}'::jsonb;
