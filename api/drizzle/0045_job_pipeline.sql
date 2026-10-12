-- Migration: per-job recruiter pipeline kanban
--
-- job_pipeline_entries is a candidate-on-this-job row, decoupled from
-- jobApplications so a recruiter can manually source candidates who never
-- applied. pipeline_touchpoints captures the audit trail (stage changes,
-- emails, SMS, notes) for the "every touchpoint logged automatically" claim.

CREATE TABLE IF NOT EXISTS job_pipeline_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES job_items(id) ON DELETE CASCADE,

  candidate_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  candidate_name VARCHAR(200) NOT NULL,
  candidate_email VARCHAR(320),
  candidate_phone VARCHAR(50),
  candidate_location VARCHAR(200),
  candidate_linkedin_url TEXT,
  candidate_resume_url TEXT,
  candidate_avatar_url TEXT,

  stage VARCHAR(32) NOT NULL DEFAULT 'applied',
  stage_changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  owner_id UUID REFERENCES users(id) ON DELETE SET NULL,

  added_from VARCHAR(32) NOT NULL DEFAULT 'manual',
  job_application_id UUID REFERENCES job_applications(id) ON DELETE SET NULL,

  notes TEXT,
  tags JSONB DEFAULT '[]'::jsonb,
  rejected_at TIMESTAMPTZ,
  rejection_reason TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pipeline_job_stage ON job_pipeline_entries(job_id, stage);
CREATE INDEX IF NOT EXISTS idx_pipeline_job_owner ON job_pipeline_entries(job_id, owner_id);
CREATE INDEX IF NOT EXISTS idx_pipeline_candidate_user ON job_pipeline_entries(candidate_user_id);

CREATE TABLE IF NOT EXISTS pipeline_touchpoints (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_id UUID NOT NULL REFERENCES job_pipeline_entries(id) ON DELETE CASCADE,
  type VARCHAR(32) NOT NULL,
  payload JSONB DEFAULT '{}'::jsonb,
  performed_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_touchpoints_entry_created ON pipeline_touchpoints(entry_id, created_at);
