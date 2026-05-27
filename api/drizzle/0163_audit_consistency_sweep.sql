-- Consistency-audit closures:
--   (a) Missing updated_at columns on tables that legitimately need one
--       for audit / SLA tracking.
--   (b) creators.studio_project_id text → uuid + FK (consistency drift —
--       the parent studio_projects.id is uuid).
--
-- Out of scope (logged as residuals): subject_kind → subject_type rename
-- on studio_project_subjects (semantic rename touches service code at N
-- callsites; #1648 tracks the sweep).

-- ---------------------------------------------------------------------------
-- (a) Missing updated_at columns.
--     conversation_participants, message_read_receipts, invoice_line_items.
--     All three are mutable in practice (role changes, retraction,
--     line-item corrections) but the schema treats them as immutable.
-- ---------------------------------------------------------------------------

ALTER TABLE conversation_participants
  ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone NOT NULL DEFAULT NOW();

ALTER TABLE message_read_receipts
  ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone NOT NULL DEFAULT NOW();

ALTER TABLE invoice_line_items
  ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone NOT NULL DEFAULT NOW();

-- ---------------------------------------------------------------------------
-- (b) creators.studio_project_id text → uuid + FK.
--     Same pattern as 0146 — gated by data_type check so re-runs after
--     drizzle-kit push are no-ops.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.__mig_0160_convert_studio_project_id()
RETURNS void
LANGUAGE plpgsql
AS $func$
DECLARE
  col_type text;
BEGIN
  SELECT data_type INTO col_type
  FROM information_schema.columns
  WHERE table_name = 'creators' AND column_name = 'studio_project_id';

  -- Only run conversion if (a) table exists, (b) column exists, (c) is still text.
  IF col_type = 'text' THEN
    -- NULL out orphans before type conversion.
    UPDATE creators
    SET studio_project_id = NULL
    WHERE studio_project_id IS NOT NULL
      AND (studio_project_id !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
           OR NOT EXISTS (SELECT 1 FROM studio_projects WHERE studio_projects.id::text = creators.studio_project_id));

    EXECUTE 'ALTER TABLE creators ALTER COLUMN studio_project_id TYPE uuid USING NULLIF(studio_project_id, '''')::uuid';
  END IF;

  IF col_type IS NOT NULL AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'creators_studio_project_id_fkey') THEN
    ALTER TABLE creators
      ADD CONSTRAINT creators_studio_project_id_fkey
      FOREIGN KEY (studio_project_id) REFERENCES studio_projects(id) ON DELETE SET NULL;
  END IF;
END;
$func$;

SELECT public.__mig_0160_convert_studio_project_id();

DROP FUNCTION IF EXISTS public.__mig_0160_convert_studio_project_id();
