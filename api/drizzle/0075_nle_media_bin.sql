-- 0075 — NLE media bin metadata: folders + tags + relink-source helper
--
-- Closes gap entries #346 (relink offline media) and #347 (bin search /
-- filter / custom tags) from the studio NLE audit. The proxy_url column
-- already exists on nle_media_sources (migration 0067); this migration
-- only adds the missing bin metadata.
--
-- See:
--   shared/timeline.ts                    — MediaSource shape (frontend mirror)
--   api/src/db/schema/nle.ts              — Drizzle schema mirroring the changes
--   api/src/routes/nle.ts                 — routes that consume the new columns
--   memory/project_nle_decision.md        — overall NLE direction

-- ── Bin folder ────────────────────────────────────────────────────────
--
-- Optional folder path the editor groups sources by. NULL = root. Free-
-- text rather than a separate folder table because pro NLE bins are
-- effectively user-owned hierarchies with no shared semantics — a join
-- table would be over-engineered for "show me my B-roll/" UX.
ALTER TABLE nle_media_sources
  ADD COLUMN IF NOT EXISTS bin_folder text;

CREATE INDEX IF NOT EXISTS idx_nle_media_sources_bin_folder
  ON nle_media_sources (user_id, bin_folder);

-- ── Custom tags ───────────────────────────────────────────────────────
--
-- Many-to-many: a source can carry any number of free-text tags. Used
-- for facet filters in the bin ("show me everything tagged 'interview'
-- AND 'wide'"). Cascades when the source row is deleted.
CREATE TABLE IF NOT EXISTS nle_media_tags (
  source_id  uuid NOT NULL REFERENCES nle_media_sources(id) ON DELETE CASCADE,
  tag        varchar(64) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (source_id, tag)
);

CREATE INDEX IF NOT EXISTS idx_nle_media_tags_tag
  ON nle_media_tags (tag);
CREATE INDEX IF NOT EXISTS idx_nle_media_tags_source
  ON nle_media_tags (source_id);

COMMENT ON COLUMN nle_media_sources.bin_folder
  IS 'Optional folder path for editor bin grouping. NULL = root.';
COMMENT ON TABLE  nle_media_tags
  IS 'Free-text tags on NLE media sources for bin facet filters.';
