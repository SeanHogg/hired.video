-- Migration 0511 — rebuild help_mappings to the v2 (slug-keyed) shape.
--
-- Gap #2341. Production still has the v1 help_mappings (37 rows keyed on
-- article_id → the dropped help_articles table); 0210's CREATE TABLE IF NOT
-- EXISTS was a no-op there. drizzle-kit push then hits an interactive
-- "rename article_id → slug?" prompt it cannot answer in CI and crashes,
-- so every later schema change silently failed to push.
--
-- Decision (2026-10-10, owner-approved): drop the v1 table — its rows point
-- at content that no longer exists — and recreate v2 with 0210's seed.
--
-- Gated on the v1 column so a database that already has v2 (every fresh
-- database, and production after this runs once) is left untouched.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'help_mappings' AND column_name = 'article_id'
  ) THEN
    DROP TABLE IF EXISTS help_mappings;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS help_mappings (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  context_key  VARCHAR(64) NOT NULL,
  slug         VARCHAR(128) NOT NULL,
  position     INTEGER NOT NULL DEFAULT 0,
  is_active    BOOLEAN NOT NULL DEFAULT true,
  created_by   UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_help_mappings_context_slug
  ON help_mappings (context_key, slug);

CREATE INDEX IF NOT EXISTS idx_help_mappings_context_active
  ON help_mappings (context_key, is_active, position);

INSERT INTO help_mappings (context_key, slug, position)
VALUES
  ('general',       'create-first-video-resume', 0),
  ('general',       'supported-file-formats',    1),
  ('general',       'set-up-profile',            2),
  ('general',       'getting-started',           3),
  ('general',       'tutorials',                 4),
  ('dashboard',     'set-up-profile',            0),
  ('dashboard',     'getting-started',           1),
  ('dashboard',     'candidate-pipeline',        2),
  ('profile-edit',  'set-up-profile',            0),
  ('profile-edit',  'change-password',           1),
  ('profile-edit',  'change-role',               2),
  ('profile-edit',  'delete-account',            3),
  ('profile-view',  'networking',                0),
  ('studio',        'create-first-video-resume', 0),
  ('studio',        'good-video-resume',         1),
  ('studio',        'edit-video-resume',         2),
  ('studio',        'private-video-resume',      3),
  ('studio',        'video-best-practices',      4),
  ('resume-edit',   'good-video-resume',         0),
  ('resume-edit',   'edit-video-resume',         1),
  ('resume-edit',   'video-best-practices',      2),
  ('resume-create', 'create-first-video-resume', 0),
  ('resume-create', 'good-video-resume',         1),
  ('resume-view',   'private-video-resume',      0),
  ('resume-view',   'edit-video-resume',         1),
  ('job-list',      'job-matching',              0),
  ('job-list',      'track-applications',        1),
  ('job-list',      'job-match-notifications',   2),
  ('job-list',      'job-search',                3),
  ('search',        'job-matching',              0),
  ('search',        'search-candidates',         1),
  ('search',        'job-search',                2),
  ('job-create',    'post-a-job',                0),
  ('job-create',    'search-candidates',         1),
  ('job-create',    'workforce',                 2)
ON CONFLICT (context_key, slug) DO NOTHING;
