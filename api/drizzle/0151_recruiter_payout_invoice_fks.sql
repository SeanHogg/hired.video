-- #1595 residual — recruiter / payouts / invoices missing FK constraints.
--
-- All columns are already uuid (the audit was wrong about them being text);
-- they just lack `.references()`. Pure ADD CONSTRAINT migration with
-- orphan-NULL or orphan-DELETE pre-flights per nullable / NOT NULL.
--
-- Also adds the polymorphic CHECK on payout_ledger_entries.source_kind
-- that's been in #1595's residual list.
--
-- Idempotent: every block uses DO + pg_constraint existence checks.

-- ---------------------------------------------------------------------------
-- DRY helper: add an FK on (target_table, fk_column) → parent_table(parent_column).
-- For nullable columns, orphans get NULL'd. For NOT NULL columns, rows are
-- DELETE'd. Pass `is_nullable = true` for NULL behavior.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION pg_temp.__add_fk(
  target_table   text,
  fk_column      text,
  parent_table   text,
  parent_column  text,
  on_delete      text,
  is_nullable    boolean
) RETURNS void
LANGUAGE plpgsql
AS $func$
DECLARE
  fk_name  text := target_table || '_' || fk_column || '_fkey';
BEGIN
  IF is_nullable THEN
    EXECUTE format(
      'UPDATE %I SET %I = NULL WHERE %I IS NOT NULL AND NOT EXISTS (SELECT 1 FROM %I WHERE %I.%I = %I.%I)',
      target_table, fk_column, fk_column,
      parent_table, parent_table, parent_column, target_table, fk_column
    );
  ELSE
    EXECUTE format(
      'DELETE FROM %I WHERE %I IS NULL OR NOT EXISTS (SELECT 1 FROM %I WHERE %I.%I = %I.%I)',
      target_table, fk_column,
      parent_table, parent_table, parent_column, target_table, fk_column
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = fk_name) THEN
    EXECUTE format(
      'ALTER TABLE %I ADD CONSTRAINT %I FOREIGN KEY (%I) REFERENCES %I(%I) ON DELETE %s',
      target_table, fk_name, fk_column, parent_table, parent_column, on_delete
    );
  END IF;
END;
$func$;

-- ---------------------------------------------------------------------------
-- Recruiter family — all FK columns are uuid, just missing references.
-- ---------------------------------------------------------------------------

-- recruiter_match_scores: jobId NOT NULL, candidateId NOT NULL.
SELECT pg_temp.__add_fk('recruiter_match_scores', 'job_id',       'job_items', 'id', 'CASCADE', false);
SELECT pg_temp.__add_fk('recruiter_match_scores', 'candidate_id', 'talent_pool_candidates', 'id', 'CASCADE', false);

-- queue_job_to_resume: NOT NULL both.
SELECT pg_temp.__add_fk('queue_job_to_resume', 'job_id',    'job_items',          'id', 'CASCADE', false);
SELECT pg_temp.__add_fk('queue_job_to_resume', 'resume_id', 'resume_information', 'id', 'CASCADE', false);

-- recruiter_agent_runs: jobId nullable.
SELECT pg_temp.__add_fk('recruiter_agent_runs', 'job_id', 'job_items', 'id', 'SET NULL', true);

-- candidate_submissions: jobId, resumeId both nullable.
SELECT pg_temp.__add_fk('candidate_submissions', 'job_id',    'job_items',          'id', 'SET NULL', true);
SELECT pg_temp.__add_fk('candidate_submissions', 'resume_id', 'resume_information', 'id', 'SET NULL', true);

-- placements: jobId nullable, parentPlacementId self-FK SET NULL.
SELECT pg_temp.__add_fk('placements', 'job_id',              'job_items', 'id', 'SET NULL', true);
SELECT pg_temp.__add_fk('placements', 'parent_placement_id', 'placements', 'id', 'SET NULL', true);
SELECT pg_temp.__add_fk('placements', 'placement_type_id',   'workspace_job_types', 'id', 'SET NULL', true);

-- placement_splits.owner_user_id → users.id (CASCADE — when the user goes
-- away, their split goes with them; the placement row stays).
SELECT pg_temp.__add_fk('placement_splits', 'owner_user_id', 'users', 'id', 'CASCADE', false);

-- placement_notification_subscriptions.user_id.
SELECT pg_temp.__add_fk('placement_notification_subscriptions', 'user_id', 'users', 'id', 'CASCADE', false);

-- job_board_postings.job_id (NOT NULL).
SELECT pg_temp.__add_fk('job_board_postings', 'job_id', 'job_items', 'id', 'CASCADE', false);

-- ---------------------------------------------------------------------------
-- Invoices (#1595)
-- ---------------------------------------------------------------------------

-- recipientCompanyId nullable (SaaS subscription invoices vs agency-to-client).
SELECT pg_temp.__add_fk('invoices', 'recipient_company_id', 'company_profiles', 'id', 'SET NULL', true);

-- sourceTimesheetId nullable (only set on workforce-derived invoices).
SELECT pg_temp.__add_fk('invoices', 'source_timesheet_id', 'timesheets', 'id', 'SET NULL', true);

-- ---------------------------------------------------------------------------
-- payout_ledger_entries polymorphic CHECK on source_kind.
-- The column is nullable; CHECK only fires when set. Mirrors the
-- application-side enum.
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'payout_ledger_entries_source_kind_check'
  ) THEN
    ALTER TABLE payout_ledger_entries
      ADD CONSTRAINT payout_ledger_entries_source_kind_check
      CHECK (source_kind IS NULL OR source_kind IN (
        'service_order',
        'voice_clone_license',
        'gift_card',
        'platform_fee',
        'creator_payout',
        'manual_adjustment',
        'commission',
        'partner_program'
      )) NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'payout_ledger_entries_kind_check'
  ) THEN
    ALTER TABLE payout_ledger_entries
      ADD CONSTRAINT payout_ledger_entries_kind_check
      CHECK (kind IN ('accrual', 'payout', 'reversal', 'adjustment')) NOT VALID;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- Note on taxonomies workspace FKs: not added in this migration because
-- there is no `workspaces` parent table — workspace_id in
-- workspace_tags / workspace_job_types / workspace_sources / etc. is a
-- logical scope that resolves to either company_profiles.id or a
-- user-id depending on context. The application enforces tenancy.
-- See #1626 (logged separately) for the workspaces-as-real-table fix.
-- ---------------------------------------------------------------------------
