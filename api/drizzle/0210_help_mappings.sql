-- Migration 0210 — context-aware help mappings (v2, slug-keyed meta).
--
-- A SuperAdmin curates which help ITEMS surface on each *kind* of page,
-- keyed on AIContextType (the route→context seam reused from the AI brain;
-- see shared/help.ts). The mapping points at a content SLUG — the content
-- itself lives in bundled Markdown files (frontend/content/help/<slug>.*.md),
-- NOT the database. This table is pure meta: context → ordered slug list.
--
-- (Content is files; the DB is used strictly for mapping meta + as the home
-- of the semantic-search vectors, which live in Cloudflare Vectorize, not
-- here. No help content or content text is ever stored in Postgres.)
--
-- Idempotent per drizzle/TEMPLATE.md.

CREATE TABLE IF NOT EXISTS help_mappings (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- AIContextType value (e.g. "resume-edit"). Code enum, validated at the route.
  context_key  VARCHAR(64) NOT NULL,
  -- Content slug — matches a frontend/content/help/<slug>.*.md item. No FK:
  -- content is files, not rows.
  slug         VARCHAR(128) NOT NULL,
  position     INTEGER NOT NULL DEFAULT 0,
  is_active    BOOLEAN NOT NULL DEFAULT true,
  created_by   UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- One curation row per (context, slug); POST upserts on this.
CREATE UNIQUE INDEX IF NOT EXISTS uq_help_mappings_context_slug
  ON help_mappings (context_key, slug);

-- The public resolve reads active rows for a context, ordered.
CREATE INDEX IF NOT EXISTS idx_help_mappings_context_active
  ON help_mappings (context_key, is_active, position);

-- Seed initial context→slug mappings. Slugs match the bundled content
-- files; re-running is a no-op via the unique index.
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
