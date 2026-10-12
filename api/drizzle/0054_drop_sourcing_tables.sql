-- Migration 0054 — Drop legacy contact-sourcing implementation.
--
-- The contact-sourcing capability moves to BurnRateOS (sister product).
-- Hired.video will consume BurnRateOS via API/widget; see
-- docs/prd/integrations-and-sourcing.md.
--
-- This migration drops the contact-data tables and the seeded sourcing
-- providers, but KEEPS:
--   * `integrations` / `integration_credentials` / `integration_runs` —
--     repurposed as a generic external-systems registry (one BurnRateOS row
--     will be seeded when the BurnRateOS client lands).
--   * `enrichment_credits` / `enrichment_transactions` — defined in
--     migration 0015 and shared with the advertising/billing system; not
--     exclusively a sourcing concern.

-- Drop in dependency order (children first).
DROP TABLE IF EXISTS sourced_person_merge_log CASCADE;
DROP TABLE IF EXISTS person_sources CASCADE;
DROP TABLE IF EXISTS person_identifiers CASCADE;
DROP TABLE IF EXISTS enrichment_cache CASCADE;
DROP TABLE IF EXISTS sourced_people CASCADE;
DROP TABLE IF EXISTS data_suppression_list CASCADE;
DROP TABLE IF EXISTS data_subject_requests CASCADE;

-- Remove the seeded sourcing providers from the registry. Leaves the
-- `integrations` table empty and ready to receive a BurnRateOS row when
-- the new client integration lands.
DELETE FROM integrations
WHERE slug IN (
  'peopledatalabs',
  'apollo',
  'proxycurl',
  'hunter',
  'github',
  'stackoverflow',
  'wikidata',
  'commoncrawl',
  'opencorporates'
);
