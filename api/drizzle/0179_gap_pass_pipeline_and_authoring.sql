-- 0179 — multi-gap pass: agency BD pipeline (#99), configurable pipeline stages
-- (#222), Deals ownership (#223), Studio video → job posting (#743), companion
-- studio-video for course lessons (#1520).
--
-- The Deals table mirrors the existing `placements` shape but tracks the
-- employer-relationship side of the agency funnel (prospect → qualified →
-- contract → active → churned). Per-tenant configurable stages live in
-- `pipeline_stages`; legacy hard-coded stage strings keep working via the
-- `stage_key` column.

BEGIN;

-- ---------------------------------------------------------------------------
-- #99 — agency recruiter BD pipeline
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS recruiter_clients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recruiter_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  company_id uuid REFERENCES company_profiles(id) ON DELETE SET NULL,
  client_name varchar(255) NOT NULL,
  website varchar(255),
  industry varchar(120),
  status varchar(32) NOT NULL DEFAULT 'prospect'
    CHECK (status IN ('prospect', 'qualified', 'contract', 'active', 'churned')),
  notes text,
  last_activity_at timestamptz,
  open_requisitions integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_recruiter_clients_recruiter
  ON recruiter_clients(recruiter_user_id, status);

CREATE TABLE IF NOT EXISTS recruiter_client_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES recruiter_clients(id) ON DELETE CASCADE,
  name varchar(255) NOT NULL,
  title varchar(255),
  email varchar(255),
  phone varchar(64),
  is_primary boolean NOT NULL DEFAULT false,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_recruiter_client_contacts_client
  ON recruiter_client_contacts(client_id);

-- ---------------------------------------------------------------------------
-- #222 — configurable sales pipeline stages
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS pipeline_stages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recruiter_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  pipeline_key varchar(32) NOT NULL DEFAULT 'default',
  stage_key varchar(48) NOT NULL,
  stage_label varchar(128) NOT NULL,
  ordinal integer NOT NULL DEFAULT 0,
  default_value_cents integer,
  win_probability_bps integer
    CHECK (win_probability_bps IS NULL OR (win_probability_bps >= 0 AND win_probability_bps <= 10000)),
  is_closed_won boolean NOT NULL DEFAULT false,
  is_closed_lost boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (recruiter_user_id, pipeline_key, stage_key)
);

CREATE INDEX IF NOT EXISTS idx_pipeline_stages_recruiter_pipeline
  ON pipeline_stages(recruiter_user_id, pipeline_key, ordinal);

-- ---------------------------------------------------------------------------
-- #99 + #223 — Deals (BD opportunities)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS recruiter_deals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recruiter_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  client_id uuid REFERENCES recruiter_clients(id) ON DELETE SET NULL,
  job_id uuid,
  name varchar(255) NOT NULL,
  -- #223 — Deals carry ownership + custom pipeline assignment
  pipeline_id uuid REFERENCES pipeline_stages(id) ON DELETE SET NULL,
  pipeline_key varchar(32) NOT NULL DEFAULT 'default',
  stage_key varchar(48) NOT NULL DEFAULT 'prospect',
  owner_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  owner_type varchar(24) NOT NULL DEFAULT 'recruiter',
  est_fee_cents integer,
  win_probability_bps integer
    CHECK (win_probability_bps IS NULL OR (win_probability_bps >= 0 AND win_probability_bps <= 10000)),
  expected_close_date date,
  closed_at timestamptz,
  is_won boolean,
  last_activity_at timestamptz,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_recruiter_deals_recruiter
  ON recruiter_deals(recruiter_user_id, stage_key);

CREATE INDEX IF NOT EXISTS idx_recruiter_deals_client
  ON recruiter_deals(client_id);

CREATE INDEX IF NOT EXISTS idx_recruiter_deals_owner
  ON recruiter_deals(owner_user_id) WHERE owner_user_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- #743 — attach a Studio Project (video resume style) to a job posting
-- ---------------------------------------------------------------------------
ALTER TABLE job_items
  ADD COLUMN IF NOT EXISTS video_project_id uuid
    REFERENCES studio_projects(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_job_items_video_project
  ON job_items(video_project_id) WHERE video_project_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- #1520 — companion Studio video lesson on text_md lessons
-- ---------------------------------------------------------------------------
ALTER TABLE course_lessons
  ADD COLUMN IF NOT EXISTS companion_studio_project_id uuid
    REFERENCES studio_projects(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_course_lessons_companion_video
  ON course_lessons(companion_studio_project_id)
  WHERE companion_studio_project_id IS NOT NULL;

COMMIT;
