-- 0180 — multi-gap pass:
--   #101  freelance / gig marketplace tables
--   #927  'game' canvas runtime — game_state column + media_kind allowance
--   #1209 live_screen_session_invites unique token index (frontend wiring needs it)
--   #1560 photorealistic avatar provider seam — render-job table
--
-- The NLE M5 capability registry (#285), OpenVoice service scaffold (#287),
-- and A/V mixing milestone (#292) are pure code additions — no schema work.

BEGIN;

-- ---------------------------------------------------------------------------
-- #101 — freelance / gig marketplace
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS gig_projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title varchar(255) NOT NULL,
  description text NOT NULL,
  required_skills jsonb NOT NULL DEFAULT '[]'::jsonb,
  budget_kind varchar(16) NOT NULL DEFAULT 'fixed'
    CHECK (budget_kind IN ('fixed', 'hourly')),
  budget_min_cents integer NOT NULL CHECK (budget_min_cents >= 0),
  budget_max_cents integer NOT NULL CHECK (budget_max_cents >= 0),
  estimated_duration_days integer,
  status varchar(16) NOT NULL DEFAULT 'open'
    CHECK (status IN ('draft', 'open', 'in_progress', 'completed', 'cancelled')),
  awarded_bid_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_gig_projects_owner ON gig_projects(owner_user_id, status);
CREATE INDEX IF NOT EXISTS idx_gig_projects_status_created ON gig_projects(status, created_at DESC);

CREATE TABLE IF NOT EXISTS gig_bids (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES gig_projects(id) ON DELETE CASCADE,
  bidder_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  cover_letter text NOT NULL,
  proposed_amount_cents integer NOT NULL CHECK (proposed_amount_cents >= 0),
  proposed_duration_days integer,
  status varchar(16) NOT NULL DEFAULT 'submitted'
    CHECK (status IN ('submitted', 'shortlisted', 'awarded', 'rejected', 'withdrawn')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, bidder_user_id)
);

CREATE INDEX IF NOT EXISTS idx_gig_bids_project ON gig_bids(project_id, status);
CREATE INDEX IF NOT EXISTS idx_gig_bids_bidder ON gig_bids(bidder_user_id);

CREATE TABLE IF NOT EXISTS gig_milestones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES gig_projects(id) ON DELETE CASCADE,
  ordinal integer NOT NULL DEFAULT 0,
  title varchar(255) NOT NULL,
  amount_cents integer NOT NULL CHECK (amount_cents >= 0),
  description text,
  status varchar(16) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'in_progress', 'submitted', 'approved', 'disputed', 'released')),
  provider_escrow_id text,
  approved_at timestamptz,
  released_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_gig_milestones_project ON gig_milestones(project_id, ordinal);

ALTER TABLE gig_projects
  ADD CONSTRAINT gig_projects_awarded_bid_fk
  FOREIGN KEY (awarded_bid_id) REFERENCES gig_bids(id) ON DELETE SET NULL
  DEFERRABLE INITIALLY DEFERRED;

-- ---------------------------------------------------------------------------
-- #927 — game canvas runtime
-- ---------------------------------------------------------------------------
ALTER TABLE studio_projects
  ADD COLUMN IF NOT EXISTS game_state jsonb;

-- The CHECK constraint on media_kind is enforced at the application layer
-- (shared/media-kinds.ts) — the DB column is varchar without an enum so we
-- don't have to ALTER TYPE for every new kind. Still, drop any legacy
-- constraint if a deployment created one and a new dispatcher needs 'game'.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_class t ON c.conrelid = t.oid
    WHERE t.relname = 'studio_projects' AND c.conname LIKE 'studio_projects_media_kind%check%'
  ) THEN
    ALTER TABLE studio_projects DROP CONSTRAINT IF EXISTS studio_projects_media_kind_check;
  END IF;
END
$$;

-- ---------------------------------------------------------------------------
-- #1209 — live-screen invite tokens MUST be unique for the public landing
-- page to resolve. Add the unique index if it isn't already there.
-- ---------------------------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS uq_live_screening_invites_token
  ON live_screening_invites(invite_token);

-- ---------------------------------------------------------------------------
-- #1560 — photorealistic-avatar render jobs (provider seam)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS photoreal_avatar_renders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider varchar(32) NOT NULL,
  portrait_media_id uuid,
  voice_clone_id uuid,
  script_text text,
  audio_url text,
  output_video_url text,
  provider_job_id text,
  status varchar(16) NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'rendering', 'completed', 'failed')),
  failure_reason text,
  duration_seconds integer,
  cost_cents integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_photoreal_avatar_renders_owner
  ON photoreal_avatar_renders(owner_user_id, status);

COMMIT;
