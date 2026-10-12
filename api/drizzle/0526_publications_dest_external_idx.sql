-- Migration 0526 — studio_project_publications: look up by the network's post
-- id, and remember who posted (#2048).
--
-- 1. (destination, external_id) index. Inbound platform webhooks
--    (/api/social/webhooks/:platform) name a post by the network's own id;
--    the ingest finds its publication — and a finished async publish
--    re-keys it (TikTok publish_id → post id) — by this pair. Without the
--    index both are a scan of the publications table.
-- 2. published_by: the user whose connected account made the post. A
--    delegate posting a company project posts with THEIR account, so the
--    metrics sync must read the post with that account's token, not the
--    project owner's. Nullable: rows from before this column (and on-
--    platform destinations) fall back to the scheduled job's creator, then
--    the owner. ON DELETE SET NULL — the publication outlives its poster.
--
-- Additive only: one nullable column + two indexes. No data is changed or
-- deleted. Idempotent: IF NOT EXISTS throughout (ADD COLUMN IF NOT EXISTS
-- skips its inline REFERENCES when the column is already there). Declared
-- in db/schema/studioPublications.ts with the same names (CI
-- `drizzle-kit push` drops undeclared indexes).

CREATE INDEX IF NOT EXISTS idx_studio_project_publications_dest_external
  ON studio_project_publications (destination, external_id);

ALTER TABLE studio_project_publications
  ADD COLUMN IF NOT EXISTS published_by uuid REFERENCES users(id) ON DELETE SET NULL;

-- ON DELETE SET NULL target.
CREATE INDEX IF NOT EXISTS idx_studio_project_publications_published_by
  ON studio_project_publications (published_by);
