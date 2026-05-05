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
-- Migration strategy: the previous column type was varchar(255), so by
-- definition no row was holding structured JSON yet. Every legacy value
-- is treated as a free-text address and wrapped as `{ "address": <text> }`
-- — that's the only field CompanyDetail reads for legacy rows, and it
-- means the migration never has to attempt a JSON parse on text that
-- isn't valid JSON (which is what was failing in the first deploy
-- attempt: a value like "Troy, MI" or even a brace-containing free-text
-- string is not parseable as JSON, so `value::jsonb` errored out).
--
-- Idempotent: re-running after partial rollout is a no-op.

ALTER TABLE company_profiles
  ALTER COLUMN headquarters TYPE jsonb
  USING CASE
    WHEN headquarters IS NULL OR headquarters = '' THEN NULL
    ELSE jsonb_build_object('address', headquarters)
  END;

ALTER TABLE company_profiles ADD COLUMN IF NOT EXISTS contact jsonb NOT NULL DEFAULT '{}'::jsonb;
