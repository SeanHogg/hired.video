-- Migration 0530 — nle_media_sources.bin_folder text_pattern_ops index (#1804)
--
-- POST /api/nle/sources/folders/rename matches via
--   bin_folder = from OR bin_folder LIKE 'from/%'
-- The existing btree idx_nle_media_sources_bin_folder (user_id, bin_folder)
-- serves the equality branch. Default-collation btree cannot use LIKE
-- 'prefix/%'; text_pattern_ops compares byte-wise so the prefix pattern
-- can range-scan this index.
--
-- Additive only. Idempotent: CREATE INDEX IF NOT EXISTS.
-- Declared in db/schema/nle.ts under the same name (CI `drizzle-kit push`
-- drops undeclared indexes). No BEGIN/COMMIT — the runner applies
-- statement by statement.

CREATE INDEX IF NOT EXISTS idx_nle_media_sources_bin_folder_text_pattern
  ON nle_media_sources (bin_folder text_pattern_ops);
