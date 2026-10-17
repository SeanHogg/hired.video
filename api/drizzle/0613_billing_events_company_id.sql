-- 0613_billing_events_company_id.sql
--
-- W3-D1. The desk-margin read (services/workforce/desk-margin.ts) filtered
-- billing_events on (payload->>'companyId')::uuid — an unindexable JSONB cast.
-- Promote it to a typed, FK'd, indexed `company_id` column, written by the two
-- workforce writers (seats.ts, timesheet-derivation.ts). The payload keeps the
-- key: the provider-sync reconciliation stream re-reads the raw payload.
--
-- Backfill only ids that exist in company_profiles (orphans stay NULL — the
-- FK is ON DELETE SET NULL anyway). Idempotent.

ALTER TABLE billing_events ADD COLUMN IF NOT EXISTS company_id uuid;

-- CASE-guarded cast: Postgres does not promise AND short-circuit order, so a
-- bare ::uuid next to the regex could still see a malformed value.
UPDATE billing_events be
SET company_id = cp.id
FROM company_profiles cp
WHERE be.company_id IS NULL
  AND jsonb_typeof(be.payload) = 'object'
  AND cp.id = CASE
    WHEN be.payload->>'companyId' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    THEN (be.payload->>'companyId')::uuid
  END;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'billing_events_company_id_company_profiles_id_fk') THEN
    ALTER TABLE billing_events ADD CONSTRAINT billing_events_company_id_company_profiles_id_fk
      FOREIGN KEY (company_id) REFERENCES company_profiles(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_billing_events_company_id ON billing_events (company_id);
