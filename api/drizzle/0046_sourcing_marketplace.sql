-- Migration: recruiter sourcing marketplace
--
-- Adds sourcing fields to `job_items` and creates / aligns the `board_bids`
-- + `exclusive_boards` tables for the bidding flow:
--   • Legacy "post on board" bid:  board_id NOT NULL, job_id NULLABLE
--   • Sourcing bid (new):           board_id NULL,     job_id NOT NULL
-- `bidder_id` is the recruiter in both directions; no semantic flip needed.
--
-- Self-sufficient: creates the tables if they don't exist (some envs were
-- never on the legacy board-bidding feature so the tables are absent).
-- Fully idempotent so re-runs after a partial failure are safe.
--
-- See memory: project_bidding_marketplace — confirmed by user 2026-04-26
-- that this is the intended product direction.

-- ---------------------------------------------------------------------------
-- 1. Sourcing fields on the job aggregate
-- ---------------------------------------------------------------------------
ALTER TABLE job_items
  ADD COLUMN IF NOT EXISTS accepts_sourcing_bids BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS sourcing_fee_cents INTEGER,
  ADD COLUMN IF NOT EXISTS sourcing_deadline TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS sourcing_terms TEXT;

CREATE INDEX IF NOT EXISTS idx_jobs_accepts_sourcing
  ON job_items (accepts_sourcing_bids)
  WHERE accepts_sourcing_bids = TRUE;

-- ---------------------------------------------------------------------------
-- 2. Exclusive boards table (parent of board_bids when boardId is set)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS exclusive_boards (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name                        VARCHAR(255) NOT NULL,
  description                 TEXT,
  logo_url                    TEXT,
  category                    VARCHAR(100),
  audience_size               INTEGER DEFAULT 0,
  typical_time_to_fill_days   INTEGER,
  price_per_post              NUMERIC NOT NULL,
  currency                    VARCHAR(10) NOT NULL DEFAULT 'USD',
  is_premium_only             BOOLEAN NOT NULL DEFAULT TRUE,
  is_active                   BOOLEAN NOT NULL DEFAULT TRUE,
  metadata                    JSONB DEFAULT '{}'::jsonb,
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---------------------------------------------------------------------------
-- 3. Board / sourcing bids — created with the FINAL shape (board_id nullable,
--    sourcing-extras present). On environments where it already exists, the
--    ALTERs below bring it forward to the same shape.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS board_bids (
  id                            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Nullable: sourcing bids omit board_id (only job_id is set).
  board_id                      UUID REFERENCES exclusive_boards(id) ON DELETE CASCADE,
  -- Required for sourcing bids; legacy board bids may attach an optional jobId.
  job_id                        UUID REFERENCES job_items(id) ON DELETE SET NULL,
  bidder_id                     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  bid_amount                    NUMERIC NOT NULL,
  currency                      VARCHAR(10) NOT NULL DEFAULT 'USD',
  duration_days                 INTEGER NOT NULL DEFAULT 30,
  status                        VARCHAR(50) NOT NULL DEFAULT 'pending',
  message                       TEXT,
  proposal_text                 TEXT,
  candidates_submitted_count    INTEGER DEFAULT 0,
  start_date                    TIMESTAMPTZ,
  end_date                      TIMESTAMPTZ,
  approved_at                   TIMESTAMPTZ,
  approved_by_user_id           UUID REFERENCES users(id) ON DELETE SET NULL,
  rejection_reason              TEXT,
  created_at                    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- For environments that had board_bids from an older drizzle-kit push:
-- bring its shape forward without failing if everything is already aligned.
ALTER TABLE board_bids
  ADD COLUMN IF NOT EXISTS proposal_text TEXT,
  ADD COLUMN IF NOT EXISTS candidates_submitted_count INTEGER DEFAULT 0;

-- DROP NOT NULL on board_id only if it's still NOT NULL — wrapped so the
-- migration is a no-op when the column is already nullable.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = current_schema()
      AND table_name = 'board_bids'
      AND column_name = 'board_id'
      AND is_nullable = 'NO'
  ) THEN
    ALTER TABLE board_bids ALTER COLUMN board_id DROP NOT NULL;
  END IF;
END $$;

-- Direction-discriminator constraint: every bid must point to either a
-- board (legacy) or a job (sourcing) — never neither.
ALTER TABLE board_bids DROP CONSTRAINT IF EXISTS board_bids_direction_check;
ALTER TABLE board_bids
  ADD CONSTRAINT board_bids_direction_check
  CHECK (board_id IS NOT NULL OR job_id IS NOT NULL);

CREATE INDEX IF NOT EXISTS idx_board_bids_job
  ON board_bids (job_id, status)
  WHERE job_id IS NOT NULL;
