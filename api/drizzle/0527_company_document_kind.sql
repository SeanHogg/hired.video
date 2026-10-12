-- Migration 0527 — company pages are studio documents (#1915).
--
-- DOCUMENT_ENTITY_KINDS (shared/document-entity-kinds.ts) gains 'company',
-- so a company page published from the studio is a studio_templates row
-- with document_kind = 'company'. Widen the CHECK 0520 added to allow it.
--
-- Schema only: no row is read, changed or deleted. Idempotent: the drop is
-- IF EXISTS and the re-add is guarded, so a re-run is a no-op. NOT VALID
-- because every existing row already satisfies the narrower list. The
-- same constraint name and list are declared in
-- api/src/db/schema/studiotemplates.ts.

ALTER TABLE studio_templates DROP CONSTRAINT IF EXISTS studio_templates_document_kind_check;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'studio_templates_document_kind_check') THEN
    ALTER TABLE studio_templates
      ADD CONSTRAINT studio_templates_document_kind_check
      CHECK (document_kind IS NULL OR document_kind IN ('resume', 'article', 'job', 'blog', 'company')) NOT VALID;
  END IF;
END $$;
