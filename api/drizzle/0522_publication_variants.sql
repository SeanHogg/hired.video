-- Migration 0522 — studio_project_render_variants: fitted cuts of a Studio
-- project's master render, one per (project, variant key, content revision)
-- (#2045).
--
-- When a network's preset (shared/publish-presets) doesn't fit the master
-- render — wrong frame, or longer than the network allows — the Post dock
-- renders a fitted cut in the browser (reframed and/or trimmed), uploads it
-- as a private `videos` row and records it here. Every network that needs
-- the same cut shares its key (`variantKeyFor`: "9x16-full", "16x9-140"), so
-- one render serves TikTok, Reels and Shorts alike. `content_revision` is the
-- master content's timeline hash (+ branding): an unchanged project reuses
-- its cut, an edit gets a fresh one.
--
-- 3NF: the cut's facts live once, here. A publication row and a promotion
-- submission reference the cut they posted by `render_variant_id` (null = the
-- master render) instead of copying its key or file.
--
-- Additive only: one new table, two nullable columns, indexes. No data is
-- changed or deleted. Idempotent: IF NOT EXISTS throughout (ADD COLUMN IF NOT
-- EXISTS skips its inline REFERENCES when the column is already there).
-- Every index is declared in db/schema/{renderVariants,studioPublications,
-- promotions}.ts with the same name (CI `drizzle-kit push` drops undeclared ones).

CREATE TABLE IF NOT EXISTS studio_project_render_variants (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id        uuid NOT NULL REFERENCES studio_projects(id) ON DELETE CASCADE,
  variant_key       varchar(32) NOT NULL,
  content_revision  varchar(64) NOT NULL,
  video_id          uuid NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
  created_at        timestamptz NOT NULL DEFAULT now()
);

-- Dedupe: one cut per project, key and content revision.
CREATE UNIQUE INDEX IF NOT EXISTS uq_studio_project_render_variants_proj_key_rev
  ON studio_project_render_variants (project_id, variant_key, content_revision);

-- One file is one cut; serves the "is this video a cut of that project" check.
CREATE UNIQUE INDEX IF NOT EXISTS uq_studio_project_render_variants_video
  ON studio_project_render_variants (video_id);

ALTER TABLE studio_project_publications
  ADD COLUMN IF NOT EXISTS render_variant_id uuid
  REFERENCES studio_project_render_variants(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_studio_project_publications_variant
  ON studio_project_publications (render_variant_id);

ALTER TABLE promotion_submissions
  ADD COLUMN IF NOT EXISTS render_variant_id uuid
  REFERENCES studio_project_render_variants(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_promotion_submissions_variant
  ON promotion_submissions (render_variant_id);
