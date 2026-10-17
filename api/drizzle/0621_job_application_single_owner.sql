-- W3-D2 item 2 (architecture remediation 2026-10-17): ONE owner for "has this
-- person applied, and where is the application".
--
--   job_applications        = the application fact AND its seeker-side
--                             lifecycle (APPLICATION_STATUSES, shared/statuses.ts)
--   saved_jobs              = the bookmark only; the tracker's "tracked" state
--                             is derived (saved, no application row)
--   job_pipeline_entries    = the employer-side workflow (stage); references
--                             the fact via job_application_id
--   candidate_submissions   = agency → client submission; a different fact
--
-- This file: add job_applications.status_changed_at, normalise its status
-- vocabulary, and backfill the tracker lifecycle that lived in
-- saved_jobs.status / applied_at / status_changed_at into job_applications.
-- 0622 archives the saved_jobs copies.

ALTER TABLE job_applications ADD COLUMN IF NOT EXISTS status_changed_at timestamptz;

-- Drift inside job_applications itself ("interview", "offer", casing).
UPDATE job_applications SET status = CASE lower(trim(status))
    WHEN 'interview' THEN 'interviewing'
    WHEN 'offer' THEN 'offered'
    WHEN 'submitted' THEN 'applied'
    WHEN 'pending' THEN 'applied'
    ELSE lower(trim(status))
  END
WHERE status IS DISTINCT FROM CASE lower(trim(status))
    WHEN 'interview' THEN 'interviewing'
    WHEN 'offer' THEN 'offered'
    WHEN 'submitted' THEN 'applied'
    WHEN 'pending' THEN 'applied'
    ELSE lower(trim(status))
  END;
UPDATE job_applications SET status = 'applied'
WHERE status NOT IN ('applied', 'interviewing', 'offered', 'accepted', 'rejected', 'withdrawn', 'declined', 'cancelled');

-- Tracker rows past "tracked" with no application row → create the fact.
-- Guarded on the source column so a re-run after 0622 is a no-op.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'saved_jobs' AND column_name = 'status'
  ) THEN
    INSERT INTO job_applications (id, user_id, job_id, status, applied_at, status_changed_at, created_at, updated_at)
    SELECT gen_random_uuid(), s.user_id, s.job_id,
           lower(s.status),
           COALESCE(s.applied_at, s.status_changed_at, s.created_at),
           s.status_changed_at,
           s.created_at, now()
    FROM saved_jobs s
    WHERE lower(s.status) IN ('applied', 'interviewing', 'offered', 'accepted', 'rejected', 'withdrawn', 'declined', 'cancelled')
      AND NOT EXISTS (
        SELECT 1 FROM job_applications a WHERE a.user_id = s.user_id AND a.job_id = s.job_id
      );

    -- Existing application still at the default "applied" while the seeker's
    -- tracker moved further → the tracker's (self-reported) stage wins.
    UPDATE job_applications a
       SET status = lower(s.status),
           status_changed_at = COALESCE(s.status_changed_at, a.status_changed_at),
           updated_at = now()
      FROM saved_jobs s
     WHERE s.user_id = a.user_id AND s.job_id = a.job_id
       AND a.status = 'applied'
       AND lower(s.status) IN ('interviewing', 'offered', 'accepted', 'rejected', 'withdrawn', 'declined', 'cancelled');
  END IF;
END $$;

UPDATE job_applications SET status_changed_at = COALESCE(updated_at, applied_at)
WHERE status_changed_at IS NULL;

-- Tracker reads look up the application per (user, job).
CREATE INDEX IF NOT EXISTS idx_job_applications_user_job ON job_applications (user_id, job_id);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'job_applications_status_check') THEN
    ALTER TABLE job_applications
      ADD CONSTRAINT job_applications_status_check
      CHECK (status IN ('applied', 'interviewing', 'offered', 'accepted', 'rejected', 'withdrawn', 'declined', 'cancelled')) NOT VALID;
  END IF;
END $$;
