-- Migration: tokenised share links for the recruiter pipeline kanban.
-- Powers the "live hiring manager portal" — clients/hiring managers get a
-- read-only view of the candidate pipeline without needing an account.

CREATE TABLE IF NOT EXISTS pipeline_share_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES job_items(id) ON DELETE CASCADE,
  share_token VARCHAR(64) NOT NULL UNIQUE,
  label VARCHAR(200),
  expires_at TIMESTAMPTZ,
  created_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pipeline_share_links_job ON pipeline_share_links(job_id);
