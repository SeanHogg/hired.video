-- Migration: split the Sourcing aggregate off the Job aggregate.
--
-- Before: `job_items` carried `accepts_sourcing_bids`, `sourcing_fee_cents`,
-- `sourcing_deadline`, `sourcing_terms`. Treating sourcing as a Job property
-- conflates two domains — the Job (description / pay / requirements) and
-- the marketplace listing (fee / deadline / open-for-bids state).
--
-- After: `job_sourcing_listings` is its own aggregate (1:1 with jobs). Bids
-- still reference job_id; only the configuration layer moves.
--
-- Backfills any active sourcing config from the old columns into a row in
-- the new table, then drops the old columns.

CREATE TABLE IF NOT EXISTS job_sourcing_listings (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id                UUID NOT NULL UNIQUE REFERENCES job_items(id) ON DELETE CASCADE,
  accepts_bids          BOOLEAN NOT NULL DEFAULT FALSE,
  fee_cents             INTEGER,
  deadline              TIMESTAMPTZ,
  terms                 TEXT,
  winning_bidder_id     UUID REFERENCES users(id) ON DELETE SET NULL,
  created_by_user_id    UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_job_sourcing_listings_open
  ON job_sourcing_listings (accepts_bids)
  WHERE accepts_bids = TRUE;

-- Backfill from the old columns (only when at least one is meaningful).
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = current_schema()
      AND table_name = 'job_items'
      AND column_name = 'accepts_sourcing_bids'
  ) THEN
    INSERT INTO job_sourcing_listings (job_id, accepts_bids, fee_cents, deadline, terms, created_by_user_id)
    SELECT
      id,
      COALESCE(accepts_sourcing_bids, FALSE),
      sourcing_fee_cents,
      sourcing_deadline,
      sourcing_terms,
      posted_by_user_id
    FROM job_items
    WHERE accepts_sourcing_bids = TRUE
       OR sourcing_fee_cents IS NOT NULL
       OR sourcing_deadline IS NOT NULL
       OR sourcing_terms IS NOT NULL
    ON CONFLICT (job_id) DO NOTHING;
  END IF;
END $$;

-- Drop the now-migrated columns from `job_items`.
ALTER TABLE job_items
  DROP COLUMN IF EXISTS accepts_sourcing_bids,
  DROP COLUMN IF EXISTS sourcing_fee_cents,
  DROP COLUMN IF EXISTS sourcing_deadline,
  DROP COLUMN IF EXISTS sourcing_terms;

-- The pre-split index is on a column that no longer exists.
DROP INDEX IF EXISTS idx_jobs_accepts_sourcing;
