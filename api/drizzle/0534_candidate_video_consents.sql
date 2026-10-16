-- Migration 0534: candidate video consent — additive only
-- A recruiter's candidate-for-job video (a studio project with a
-- `talent_pool_candidate` subject) may go public / be posted socially only
-- after the candidate approves it by a tokenized email link.
--
-- token_hash = sha256 hex of a 32-byte random token; the raw token is only
-- ever in the email link, never stored.
--
-- approved_video_id / approved_video_r2_key / approved_revision pin WHAT the
-- candidate approved (the rendered file, or the storyboard `_rev` when no
-- render existed); the gate refuses once the project's content differs.
-- withdrawn_at marks an approval the candidate later withdrew (status
-- 'revoked'); a 'revoked' row without it was superseded by a newer ask.
--
-- Idempotent: IF NOT EXISTS / pg_constraint guards.
-- Constraint and index names match api/src/db/schema/candidate-video-consents.ts
-- so drizzle-kit push does not rewrite them. Status values mirror
-- CANDIDATE_VIDEO_CONSENT_STATUSES in shared/candidate-video-consent.ts.
-- No BEGIN/COMMIT — the runner applies statement by statement.

CREATE TABLE IF NOT EXISTS candidate_video_consents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES studio_projects(id) ON DELETE CASCADE,
  recruiter_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  talent_pool_candidate_id uuid REFERENCES talent_pool_candidates(id) ON DELETE SET NULL,
  candidate_name varchar(255) NOT NULL,
  candidate_email varchar(255) NOT NULL,
  token_hash varchar(64) NOT NULL,
  status varchar(16) NOT NULL DEFAULT 'pending',
  message text,
  requested_at timestamptz NOT NULL DEFAULT now(),
  responded_at timestamptz,
  expires_at timestamptz NOT NULL,
  response_ip varchar(64),
  approved_video_id uuid REFERENCES videos(id) ON DELETE SET NULL,
  approved_video_r2_key text,
  approved_revision integer,
  withdrawn_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

DO $mig$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'candidate_video_consents_status_check') THEN
    ALTER TABLE candidate_video_consents
      ADD CONSTRAINT candidate_video_consents_status_check
      CHECK (status IN ('pending', 'approved', 'declined', 'expired', 'revoked'));
  END IF;
END $mig$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_candidate_video_consents_token_hash
  ON candidate_video_consents (token_hash);

CREATE INDEX IF NOT EXISTS idx_candidate_video_consents_project_requested
  ON candidate_video_consents (project_id, requested_at DESC);

CREATE INDEX IF NOT EXISTS idx_candidate_video_consents_recruiter_requested
  ON candidate_video_consents (recruiter_id, requested_at DESC);
