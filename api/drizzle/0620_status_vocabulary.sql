-- W3-D2 (architecture remediation 2026-10-17): status vocabulary.
-- Stored lifecycle values are lowercase and CHECK-constrained to the sets in
-- shared/statuses.ts. Normalises the casing drift ("Pending", "Accepted",
-- "Submitted", "Queued", "Completed", "Paid") and maps legacy free-text
-- submission statuses onto the canonical set.
--
-- drizzle-kit push compares CHECKs by NAME only, so the re-pointed
-- user_connections check is replaced here (drop + add). Partial-index WHERE
-- clauses are not diffed by push either, so uq_user_connections_open_pair is
-- rebuilt here with the lowercase predicate. New CHECKs are NOT VALID
-- (TEMPLATE.md rule 5); rows normalised above already satisfy them.

-- ── user_connections.status: Pending | Accepted | Rejected → lowercase ──────
ALTER TABLE user_connections DROP CONSTRAINT IF EXISTS user_connections_status_check;
DROP INDEX IF EXISTS uq_user_connections_open_pair;

UPDATE user_connections SET status = lower(status) WHERE status <> lower(status);
ALTER TABLE user_connections ALTER COLUMN status SET DEFAULT 'pending';

CREATE UNIQUE INDEX IF NOT EXISTS uq_user_connections_open_pair
  ON user_connections (from_user_id, to_user_id)
  WHERE status IN ('pending', 'accepted');

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'user_connections_status_check') THEN
    ALTER TABLE user_connections
      ADD CONSTRAINT user_connections_status_check
      CHECK (status IN ('pending', 'accepted', 'rejected')) NOT VALID;
  END IF;
END $$;

-- ── candidate_submissions.status: free text → SUBMISSION_STATUSES ───────────
UPDATE candidate_submissions SET status = CASE lower(trim(status))
    WHEN 'reviewing' THEN 'reviewed'
    WHEN 'phone screen' THEN 'screening'
    WHEN 'interview' THEN 'interviewing'
    WHEN 'technical interview' THEN 'interviewing'
    WHEN 'final interview' THEN 'interviewing'
    WHEN 'offer extended' THEN 'offer'
    WHEN 'offered' THEN 'offer'
    WHEN 'accepted' THEN 'placed'
    WHEN 'started' THEN 'placed'
    WHEN 'hired' THEN 'placed'
    ELSE lower(trim(status))
  END
WHERE status IS DISTINCT FROM lower(trim(status))
   OR lower(trim(status)) IN ('reviewing', 'phone screen', 'interview', 'technical interview',
                              'final interview', 'offer extended', 'offered', 'accepted', 'started', 'hired');
-- Anything still outside the set is unrecognised free text: keep the original
-- in status_notes so nothing is lost, then reset it to the entry state.
UPDATE candidate_submissions
  SET status_notes = concat_ws(E'\n', status_notes, 'Legacy status: ' || status),
      status = 'submitted'
WHERE status NOT IN ('submitted', 'reviewed', 'screening', 'interviewing', 'offer', 'placed', 'rejected', 'withdrawn');
ALTER TABLE candidate_submissions ALTER COLUMN status SET DEFAULT 'submitted';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'candidate_submissions_status_check') THEN
    ALTER TABLE candidate_submissions
      ADD CONSTRAINT candidate_submissions_status_check
      CHECK (status IN ('submitted', 'reviewed', 'screening', 'interviewing', 'offer', 'placed', 'rejected', 'withdrawn')) NOT VALID;
  END IF;
END $$;

-- ── placements.commission_status: Pending | Paid → COMMISSION_STATUSES ──────
UPDATE placements SET commission_status = lower(trim(commission_status))
WHERE commission_status IS DISTINCT FROM lower(trim(commission_status));
UPDATE placements
  SET notes = concat_ws(E'\n', notes, 'Legacy commission status: ' || commission_status),
      commission_status = 'pending'
WHERE commission_status NOT IN ('pending', 'invoiced', 'paid', 'cancelled');
ALTER TABLE placements ALTER COLUMN commission_status SET DEFAULT 'pending';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'placements_commission_status_check') THEN
    ALTER TABLE placements
      ADD CONSTRAINT placements_commission_status_check
      CHECK (commission_status IN ('pending', 'invoiced', 'paid', 'cancelled')) NOT VALID;
  END IF;
END $$;

-- ── videos.status: Queued | Completed | … → VIDEO_STATUSES ──────────────────
UPDATE videos SET status = lower(trim(status)) WHERE status IS DISTINCT FROM lower(trim(status));
UPDATE videos SET status = 'completed' WHERE status IN ('complete', 'done', 'ready', 'published', 'exported');
UPDATE videos SET status = 'failed' WHERE status IN ('error', 'publish_failed');
UPDATE videos SET status = 'processing'
WHERE status NOT IN ('queued', 'processing', 'completed', 'failed');
ALTER TABLE videos ALTER COLUMN status SET DEFAULT 'queued';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'videos_status_check') THEN
    ALTER TABLE videos
      ADD CONSTRAINT videos_status_check
      CHECK (status IN ('queued', 'processing', 'completed', 'failed')) NOT VALID;
  END IF;
END $$;
