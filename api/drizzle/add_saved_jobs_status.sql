-- Add pipeline status columns to saved_jobs table
ALTER TABLE saved_jobs ADD COLUMN IF NOT EXISTS status VARCHAR(50) NOT NULL DEFAULT 'tracked';
ALTER TABLE saved_jobs ADD COLUMN IF NOT EXISTS status_changed_at TIMESTAMPTZ;
ALTER TABLE saved_jobs ADD COLUMN IF NOT EXISTS applied_at TIMESTAMPTZ;
ALTER TABLE saved_jobs ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE saved_jobs ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- Add extracted_profiles table
CREATE TABLE IF NOT EXISTS extracted_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recruiter_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  talent_pool_candidate_id UUID REFERENCES talent_pool_candidates(id) ON DELETE SET NULL,
  source_url TEXT NOT NULL,
  source_url_normalized VARCHAR(500),
  content_hash VARCHAR(64) NOT NULL,
  extracted_data JSONB NOT NULL DEFAULT '{}',
  extraction_method VARCHAR(50) NOT NULL DEFAULT 'extension',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_ep_dedup ON extracted_profiles(recruiter_id, content_hash);
CREATE INDEX IF NOT EXISTS idx_ep_source ON extracted_profiles(source_url_normalized);

-- Add recruiter_match_scores table
CREATE TABLE IF NOT EXISTS recruiter_match_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recruiter_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  job_id UUID NOT NULL,
  candidate_id UUID NOT NULL,
  candidate_name VARCHAR(255) NOT NULL DEFAULT '',
  job_title VARCHAR(255) NOT NULL DEFAULT '',
  score INTEGER NOT NULL,
  recommendations TEXT,
  resume_text_hash VARCHAR(64),
  scored_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (recruiter_id, job_id, candidate_id)
);
CREATE INDEX IF NOT EXISTS idx_rms_job ON recruiter_match_scores(recruiter_id, job_id);
CREATE INDEX IF NOT EXISTS idx_rms_candidate ON recruiter_match_scores(recruiter_id, candidate_id);
