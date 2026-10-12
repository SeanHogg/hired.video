-- 0182 — multi-gap pass 4 schema additions:
--   #863   job + company per-view event tables (geo / referrer / source)
--   #152   content_reports (abuse / spam flag queue)
--   #104   user_personas (B2B Sales Persona via feature-flagged label set)
--   #1386  take_home_invites (candidate-facing magic-link delivery)
--   #807   placeholder for multi-cam groups (lives in canvas state, no
--          dedicated table needed — see frontend type addition)

BEGIN;

-- ---------------------------------------------------------------------------
-- #863 — job + company per-view event tables
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS job_view_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL,
  viewer_user_id uuid,
  country_code varchar(2),
  region varchar(64),
  referrer text,
  source varchar(32) DEFAULT 'organic',
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_job_view_events_job_created ON job_view_events(job_id, created_at DESC);

CREATE TABLE IF NOT EXISTS company_view_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  viewer_user_id uuid,
  country_code varchar(2),
  region varchar(64),
  referrer text,
  source varchar(32) DEFAULT 'organic',
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_company_view_events_company_created
  ON company_view_events(company_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- #152 — abuse / spam reports
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS content_reports_v2 (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  entity_type varchar(32) NOT NULL,
  entity_id uuid NOT NULL,
  reason varchar(32) NOT NULL
    CHECK (reason IN ('spam', 'impersonation', 'inappropriate', 'illegal', 'other')),
  notes text,
  status varchar(16) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'triaged', 'actioned', 'dismissed')),
  resolved_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_content_reports_v2_entity
  ON content_reports_v2(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_content_reports_v2_status_created
  ON content_reports_v2(status, created_at DESC);

-- ---------------------------------------------------------------------------
-- #104 — user persona (sales vs recruiting label set)
-- ---------------------------------------------------------------------------
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS persona varchar(32) NOT NULL DEFAULT 'recruiting';

-- ---------------------------------------------------------------------------
-- #1386 — take-home magic-link invites
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS take_home_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  stage_id uuid NOT NULL,
  candidate_email varchar(255) NOT NULL,
  candidate_name varchar(255),
  invite_token varchar(64) NOT NULL UNIQUE,
  status varchar(16) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'started', 'submitted', 'expired')),
  expires_at timestamptz NOT NULL,
  started_at timestamptz,
  submitted_at timestamptz,
  submission_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_take_home_invites_stage
  ON take_home_invites(stage_id);

COMMIT;
