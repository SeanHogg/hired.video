-- #1601 — ON DELETE behavior fixes.
--
-- Spot-verification 2026-05-26 narrowed the scope: affiliate_profiles.user_id
-- and payout_profiles.user_id already had ON DELETE CASCADE (the original
-- audit was stale on those). Two real issues remain:
--
--   1. legal_document_acceptances.document_id is ON DELETE RESTRICT, but the
--      inline schema comment explicitly says the acceptance row is
--      "self-contained even if the source document is later edited or
--      deleted." Restrict prevents legal docs from being purged. The right
--      behavior is SET NULL — keep the compliance evidence, drop the FK.
--
--   2. resume_information.parent_id is declared without a FK at all
--      (self-referential variant tree). Deleting a parent resume orphans
--      every variant with a dangling parent_id. SET NULL turns variants
--      into root resumes on parent delete.
--
-- Both fixes are safe to apply against live data (resumes IS an active
-- surface): they're ADD CONSTRAINT / replacement-of-existing-constraint
-- operations; SET NULL only fires on future deletes.

-- ---------------------------------------------------------------------------
-- legal_document_acceptances.document_id: RESTRICT → SET NULL
-- ---------------------------------------------------------------------------

ALTER TABLE legal_document_acceptances
  DROP CONSTRAINT IF EXISTS legal_document_acceptances_document_id_fkey;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'legal_document_acceptances_document_id_fkey'
  ) THEN
    ALTER TABLE legal_document_acceptances
      ADD CONSTRAINT legal_document_acceptances_document_id_fkey
      FOREIGN KEY (document_id) REFERENCES legal_documents(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Acceptances retain kind / version / locale / accepted_at / ip / user_agent
-- as denormalised snapshots, so the document_id going NULL doesn't lose
-- the audit value — the row still tells you "this user accepted version X
-- of kind Y in locale Z at timestamp T." Set the column nullable to
-- accommodate the SET NULL path.
ALTER TABLE legal_document_acceptances
  ALTER COLUMN document_id DROP NOT NULL;

-- ---------------------------------------------------------------------------
-- resume_information.parent_id: add self-FK with ON DELETE SET NULL.
-- Pre-flight: NULL out any dangling parent_id values that point at
-- non-existent resumes (orphans by definition).
-- ---------------------------------------------------------------------------

UPDATE resume_information
SET parent_id = NULL
WHERE parent_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM resume_information parent WHERE parent.id = resume_information.parent_id
  );

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'resume_information_parent_id_fkey'
  ) THEN
    ALTER TABLE resume_information
      ADD CONSTRAINT resume_information_parent_id_fkey
      FOREIGN KEY (parent_id) REFERENCES resume_information(id) ON DELETE SET NULL;
  END IF;
END $$;
