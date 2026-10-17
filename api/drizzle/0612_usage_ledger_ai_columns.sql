-- 0612_usage_ledger_ai_columns.sql
--
-- W3-D1. The SA ai-vendors projections grouped `usage_ledger` ai_tokens rows on
-- metadata->>'featureKey' / 'requestedModel' / 'resolvedModel' /
-- 'schemaRetries' / 'substituted'. They become typed columns written at insert
-- time by servicesProcessor.meter({ ai }); token-ledger.charge no longer puts
-- those keys in `metadata` (single source). ai_usage_records was not chosen:
-- it lacks the requested model and retry count, and also holds exempt calls
-- the ledger projection never counted.
--
-- Backfill from the JSON keys of existing rows; the JSON is left untouched.
-- Idempotent: each column only fills while still empty.

ALTER TABLE usage_ledger ADD COLUMN IF NOT EXISTS feature_key varchar(100);
ALTER TABLE usage_ledger ADD COLUMN IF NOT EXISTS requested_model varchar(100);
ALTER TABLE usage_ledger ADD COLUMN IF NOT EXISTS resolved_model varchar(100);
ALTER TABLE usage_ledger ADD COLUMN IF NOT EXISTS substituted boolean NOT NULL DEFAULT false;
ALTER TABLE usage_ledger ADD COLUMN IF NOT EXISTS schema_retries integer;

UPDATE usage_ledger
SET feature_key     = left(metadata->>'featureKey', 100),
    requested_model = left(metadata->>'requestedModel', 100),
    -- Every charged call stamped `model` (the model that answered); older
    -- substitution rows also carried it as `resolvedModel`.
    resolved_model  = left(coalesce(metadata->>'resolvedModel', metadata->>'model'), 100),
    substituted     = coalesce(metadata->>'substituted', '') = 'true',
    schema_retries  = CASE WHEN metadata->>'schemaRetries' ~ '^[0-9]{1,9}$'
                           THEN (metadata->>'schemaRetries')::integer END
WHERE event_type = 'ai_tokens'
  AND feature_key IS NULL
  AND jsonb_typeof(metadata) = 'object';
