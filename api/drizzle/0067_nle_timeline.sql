-- 0067 — NLE (power-user video editor) Timeline storage
--
-- Extends `studio_projects` to host a second editor surface: the
-- frame-accurate multi-track NLE alongside the existing scene-based
-- template editor. Both editors share the same project row, the same
-- ownership model (canActFor / workspace_grants / company), and the same
-- `videos.id` foreign key for the rendered output. They differ only in
-- which payload column carries the composition: `storyboard` (scene) vs
-- `timeline_spec` (NLE).
--
-- See:
--   shared/timeline.ts                      — JSON spec for `timeline_spec`
--   memory/project_nle_decision.md          — full decision context
--   services/studio/workspace.ts            — ownership rules (unchanged)

-- The kind discriminates which payload column holds the composition.
-- Default 'scene' so every existing studio_projects row keeps using its
-- `storyboard` column without migration.
ALTER TABLE studio_projects
  ADD COLUMN IF NOT EXISTS kind varchar(16) NOT NULL DEFAULT 'scene';

-- Frame-accurate Timeline JSON for kind='nle' projects. Nullable because
-- a freshly-created NLE project starts empty; the editor populates it on
-- first save. See shared/timeline.ts for the JSON shape and
-- isRenderable() for the precondition the render facade asserts.
ALTER TABLE studio_projects
  ADD COLUMN IF NOT EXISTS timeline_spec jsonb;

-- Hard invariant: every kind value must match a known editor surface.
-- Adding a new editor (e.g. 'podcast') is a one-line change here plus a
-- new payload column; the kind enum is the single source of truth.
ALTER TABLE studio_projects
  DROP CONSTRAINT IF EXISTS studio_projects_kind_check;
ALTER TABLE studio_projects
  ADD CONSTRAINT studio_projects_kind_check
    CHECK (kind IN ('scene', 'nle'));

-- Index on kind so the studio dashboard can list per-surface
-- ("My films" vs "My templates") without scanning the full table.
CREATE INDEX IF NOT EXISTS idx_studio_projects_kind
  ON studio_projects (kind);

-- Media sources for the NLE — uploads (or stock-media references) the
-- editor pulls into the timeline. Sources are deduplicated by content
-- hash so the same B-roll clip used in 5 timelines stores once.
--
-- Ownership follows the same workspace rules as studio_projects:
-- userId + nullable companyId. Reads filter via buildOwnershipFilter().
-- Writes go through assertCanWrite(actor, userId, companyId).
CREATE TABLE IF NOT EXISTS nle_media_sources (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  company_id      uuid REFERENCES company_profiles(id) ON DELETE CASCADE,
  -- 'video' | 'audio' | 'image' — matches MediaKind in shared/timeline.ts
  kind            varchar(16) NOT NULL,
  -- sha256 of the bytes, hex-encoded. Used for dedup + the R2 object key.
  content_hash    varchar(64) NOT NULL,
  -- R2 URL of the original upload.
  url             text NOT NULL,
  -- R2 URL of the proxy (downsampled for fast editor scrubbing). Null
  -- until the proxy job completes.
  proxy_url       text,
  -- Duration in source-fps frames. The editor translates to timeline-fps
  -- on the fly via shared/timeline.ts helpers.
  duration_frames integer NOT NULL,
  -- Native fps of the source.
  fps             integer NOT NULL,
  -- Native dimensions. NULL for audio.
  width           integer,
  height          integer,
  filename        text NOT NULL,
  uploaded_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT nle_media_sources_kind_check
    CHECK (kind IN ('video', 'audio', 'image'))
);

CREATE INDEX IF NOT EXISTS idx_nle_media_sources_user
  ON nle_media_sources (user_id);
CREATE INDEX IF NOT EXISTS idx_nle_media_sources_company
  ON nle_media_sources (company_id);
-- Dedup: a single content_hash per workspace owner. A user uploading the
-- same clip twice produces ONE row, reused across timelines.
CREATE UNIQUE INDEX IF NOT EXISTS idx_nle_media_sources_dedup
  ON nle_media_sources (
    COALESCE(company_id, '00000000-0000-0000-0000-000000000000'::uuid),
    user_id,
    content_hash
  );

COMMENT ON TABLE  nle_media_sources       IS 'Deduplicated media uploads referenced by NLE Timeline.tracks[].clips[].sourceId. See shared/timeline.ts MediaSource.';
COMMENT ON COLUMN studio_projects.kind    IS 'Editor surface discriminator: scene | nle. See shared/timeline.ts and memory/project_nle_decision.md.';
COMMENT ON COLUMN studio_projects.timeline_spec IS 'NLE Timeline JSON when kind=nle. See shared/timeline.ts for the full shape.';
