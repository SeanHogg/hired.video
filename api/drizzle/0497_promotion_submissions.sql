-- Migration 0497 — promotion queue (Lane A, gap #2046).
--
-- A creator submits a rendered Studio project to be published on
-- hired.video's managed brand account (managed_accounts). A SuperAdmin
-- approves (→ publish) or rejects. One row per submission; the publish
-- result (external id/url or error) lives on the row because it is the
-- managed-lane publication record (studio_project_publications is keyed
-- one-per-(project, destination) and holds the creator's OWN publishes).
--
-- platform / status CHECKs mirror shared/promotions.ts.
-- Idempotent: IF NOT EXISTS throughout.

CREATE TABLE IF NOT EXISTS promotion_submissions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id      uuid NOT NULL REFERENCES studio_projects(id) ON DELETE CASCADE,
  submitted_by    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  platform        varchar(16) NOT NULL
                  CHECK (platform IN ('youtube', 'tiktok', 'instagram', 'x', 'facebook')),
  status          varchar(16) NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending', 'published', 'failed', 'rejected')),
  title           varchar(100) NOT NULL,
  description     text NOT NULL DEFAULT '',
  reviewed_by     uuid REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at     timestamptz,
  reject_reason   text,
  external_id     text,
  external_url    text,
  last_error      text,
  -- AI pre-screen before human review: pass | flag | block | unscreened.
  screening_verdict varchar(16) NOT NULL DEFAULT 'unscreened'
                  CHECK (screening_verdict IN ('pass', 'flag', 'block', 'unscreened')),
  screening_notes text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- One open (pending/failed) submission per project+platform.
CREATE UNIQUE INDEX IF NOT EXISTS uq_promotion_submissions_open
  ON promotion_submissions (project_id, platform)
  WHERE status IN ('pending', 'failed');

-- SuperAdmin queue: newest first within a status.
CREATE INDEX IF NOT EXISTS idx_promotion_submissions_status_created
  ON promotion_submissions (status, created_at DESC);

-- Creator view: a project's submissions.
CREATE INDEX IF NOT EXISTS idx_promotion_submissions_project
  ON promotion_submissions (project_id, created_at DESC);

-- Whether a hosted render carries the hired.video watermark. Recorded at
-- upload (POST /api/studio/upload `branded`) from the same branding policy
-- the export pipeline applies; promotion requires a branded render.
ALTER TABLE videos ADD COLUMN IF NOT EXISTS branded boolean NOT NULL DEFAULT false;
