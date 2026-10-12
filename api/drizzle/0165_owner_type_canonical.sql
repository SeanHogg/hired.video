-- #1641 — Canonical `(owner_type, owner_id)` pair for polymorphic-owned
-- tables. Migration 0153 closed the CHECK-half (XOR enforced). This
-- migration adds the canonical pair columns + backfill so service code
-- can adopt incrementally (read either pair during transition).
--
-- Tables migrated: interview_question_sets, board_bids.
-- studio_projects already uses (owner_type, owner_id); reference.
--
-- The legacy XOR columns (owner_user_id / owner_company_id on
-- interview_question_sets; board_id / job_id on board_bids) stay during
-- transition. Service-layer reads should prefer the new pair via the
-- shared `canActFor()` seam.

-- interview_question_sets: add (owner_type, owner_id), backfill from XOR.
ALTER TABLE interview_question_sets
  ADD COLUMN IF NOT EXISTS owner_type varchar(16),
  ADD COLUMN IF NOT EXISTS owner_id uuid;

UPDATE interview_question_sets
SET owner_type = CASE
      WHEN owner_user_id IS NOT NULL THEN 'user'
      WHEN owner_company_id IS NOT NULL THEN 'company'
      ELSE NULL
    END,
    owner_id = COALESCE(owner_user_id, owner_company_id)
WHERE owner_type IS NULL;

CREATE INDEX IF NOT EXISTS idx_interview_question_sets_owner
  ON interview_question_sets (owner_type, owner_id)
  WHERE owner_type IS NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'interview_question_sets_owner_type_check') THEN
    ALTER TABLE interview_question_sets
      ADD CONSTRAINT interview_question_sets_owner_type_check
      CHECK (owner_type IS NULL OR owner_type IN ('user', 'company')) NOT VALID;
  END IF;
END $$;

-- board_bids: this is a "what does the bid target" question, not a
-- pure ownership. Use (target_type, target_id) instead so the column
-- name stays semantically right.
ALTER TABLE board_bids
  ADD COLUMN IF NOT EXISTS target_type varchar(16),
  ADD COLUMN IF NOT EXISTS target_id uuid;

UPDATE board_bids
SET target_type = CASE
      WHEN board_id IS NOT NULL THEN 'board'
      WHEN job_id IS NOT NULL THEN 'job'
      ELSE NULL
    END,
    target_id = COALESCE(board_id, job_id)
WHERE target_type IS NULL;

CREATE INDEX IF NOT EXISTS idx_board_bids_target
  ON board_bids (target_type, target_id)
  WHERE target_type IS NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'board_bids_target_type_check') THEN
    ALTER TABLE board_bids
      ADD CONSTRAINT board_bids_target_type_check
      CHECK (target_type IS NULL OR target_type IN ('board', 'job')) NOT VALID;
  END IF;
END $$;
