-- #1610 — Polymorphic ownership XOR-nullable patterns get DB-enforced
-- CHECK constraints. The schema comments say "xor with X" but nothing
-- in the DB stops both columns from being set or both being NULL.
--
-- Two surfaces:
--   1. interview_question_sets.(owner_user_id, owner_company_id) — XOR
--      (exactly one set). Comment on owner_user_id literally says "xor
--      with ownerCompanyId (constraint enforced in SQL)" but the SQL
--      constraint was never actually added.
--   2. board_bids.(board_id, job_id) — at-least-one-set. The use cases
--      (legacy board posting + new sourcing-bid) make different columns
--      mandatory; the DB should reject rows with both NULL.
--
-- Out-of-scope mention: the user asked about extracting these to a
-- canonical (owner_type, owner_id) pair like studio_projects uses. That
-- requires data migration + service code changes + the canActFor() seam
-- being extended. Tracked as #1627 — the CHECK constraints in this
-- migration close the immediate correctness gap. The (owner_type,
-- owner_id) refactor stays open as a follow-up.

DO $$
BEGIN
  -- Exactly one of (owner_user_id, owner_company_id) must be set.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'interview_question_sets_owner_xor') THEN
    ALTER TABLE interview_question_sets
      ADD CONSTRAINT interview_question_sets_owner_xor
      CHECK (
        (owner_user_id IS NOT NULL AND owner_company_id IS NULL)
        OR
        (owner_user_id IS NULL AND owner_company_id IS NOT NULL)
      ) NOT VALID;
  END IF;

  -- At least one of (board_id, job_id) must be set. Legacy board bids
  -- have board_id (and optionally job_id); sourcing bids only have
  -- job_id. Both NULL would be a bid attached to nothing.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'board_bids_board_or_job') THEN
    ALTER TABLE board_bids
      ADD CONSTRAINT board_bids_board_or_job
      CHECK (board_id IS NOT NULL OR job_id IS NOT NULL) NOT VALID;
  END IF;

  -- board_bids.status — mirrors SOURCING_BID_STATUSES + the legacy
  -- board-bid states. NULL would be a bug.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'board_bids_status_check') THEN
    ALTER TABLE board_bids
      ADD CONSTRAINT board_bids_status_check
      CHECK (status IN (
        'pending', 'accepted', 'rejected', 'withdrawn', 'expired',
        'active', 'completed'
      )) NOT VALID;
  END IF;
END $$;
