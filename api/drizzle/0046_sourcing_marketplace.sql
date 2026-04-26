-- Migration: recruiter sourcing marketplace
--
-- Repurposes the existing job_boards module to support a NEW bidding
-- direction: companies post a job with a sourcing fee, external recruiters
-- bid to win the assignment. The legacy "recruiter pays to post on a
-- premium board" flow stays usable; bid direction is inferred from which
-- FK is populated:
--   board_id NOT NULL, job_id NULLABLE -> legacy board-post bid
--   board_id NULL,     job_id NOT NULL -> new sourcing bid
--
-- See memory: project_bidding_marketplace — confirmed by user 2026-04-26
-- that this is the intended product direction.

-- 1. Sourcing fields on the job itself
ALTER TABLE job_items
  ADD COLUMN IF NOT EXISTS accepts_sourcing_bids BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS sourcing_fee_cents INTEGER,
  ADD COLUMN IF NOT EXISTS sourcing_deadline TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS sourcing_terms TEXT;

CREATE INDEX IF NOT EXISTS idx_jobs_accepts_sourcing
  ON job_items (accepts_sourcing_bids)
  WHERE accepts_sourcing_bids = TRUE;

-- 2. Make board_bids.board_id nullable so sourcing bids can omit it
ALTER TABLE board_bids
  ALTER COLUMN board_id DROP NOT NULL;

-- 3. Sourcing-bid columns on board_bids (NULL on legacy rows)
ALTER TABLE board_bids
  ADD COLUMN IF NOT EXISTS proposal_text TEXT,
  ADD COLUMN IF NOT EXISTS candidates_submitted_count INTEGER DEFAULT 0;

-- 4. Direction-discriminator constraint: every bid must point to either a
--    board (legacy) or a job (sourcing) — never neither.
ALTER TABLE board_bids
  ADD CONSTRAINT board_bids_direction_check
  CHECK (board_id IS NOT NULL OR job_id IS NOT NULL);

CREATE INDEX IF NOT EXISTS idx_board_bids_job
  ON board_bids (job_id, status)
  WHERE job_id IS NOT NULL;
