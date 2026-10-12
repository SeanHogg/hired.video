-- 0181 — multi-gap pass 3:
--   #188   IP attestation column on user-submitted templates
--   #1559  portrait params (face_bbox + mouth_region) JSONB columns on avatar widgets — N/A
--          (JSONB on the existing widget params shape; no migration needed)
--
-- Templates may live in two tables depending on deploy age — `studio_templates`
-- (the universal template marketplace) is the canonical one. `job_templates`
-- is conditionally created elsewhere; tolerate its absence.

BEGIN;

ALTER TABLE studio_templates
  ADD COLUMN IF NOT EXISTS ip_attestation text;

ALTER TABLE studio_templates
  ADD COLUMN IF NOT EXISTS review_notes text;

ALTER TABLE studio_templates
  ADD COLUMN IF NOT EXISTS approved_at timestamptz;

ALTER TABLE studio_templates
  ADD COLUMN IF NOT EXISTS rejected_at timestamptz;

ALTER TABLE studio_templates
  ADD COLUMN IF NOT EXISTS listing_status varchar(32) DEFAULT 'draft';

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'job_templates') THEN
    EXECUTE 'ALTER TABLE job_templates ADD COLUMN IF NOT EXISTS ip_attestation text';
    EXECUTE 'ALTER TABLE job_templates ADD COLUMN IF NOT EXISTS review_notes text';
    EXECUTE 'ALTER TABLE job_templates ADD COLUMN IF NOT EXISTS approved_at timestamptz';
    EXECUTE 'ALTER TABLE job_templates ADD COLUMN IF NOT EXISTS rejected_at timestamptz';
    EXECUTE 'ALTER TABLE job_templates ADD COLUMN IF NOT EXISTS listing_status varchar(32) DEFAULT ''draft''';
  END IF;
END $$;

COMMIT;
