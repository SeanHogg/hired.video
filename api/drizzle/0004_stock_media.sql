-- Stock Media Library — content-addressed, deduplicated cache.
-- See gap #128: one R2 object per unique asset hash; per-user picks tracked
-- in a join table for credit accounting + recently-used lists.

CREATE TABLE IF NOT EXISTS stock_media_assets (
  hash               TEXT PRIMARY KEY,
  provider           TEXT NOT NULL,
  provider_asset_id  TEXT NOT NULL,
  media_type         TEXT NOT NULL,
  mime_type          TEXT NOT NULL,
  size_bytes         INTEGER NOT NULL,
  width              INTEGER,
  height             INTEGER,
  duration_ms        INTEGER,
  storage_key        TEXT NOT NULL,
  cdn_url            TEXT,
  source_url         TEXT NOT NULL,
  title              TEXT,
  description        TEXT,
  author             TEXT,
  author_url         TEXT,
  licence            TEXT,
  attribution_json   JSONB,
  tags               JSONB,
  pick_count         INTEGER NOT NULL DEFAULT 0,
  first_fetched_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_picked_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_stock_media_provider ON stock_media_assets(provider, provider_asset_id);
CREATE INDEX IF NOT EXISTS idx_stock_media_type ON stock_media_assets(media_type);

CREATE TABLE IF NOT EXISTS user_stock_media_usage (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     TEXT NOT NULL,
  asset_hash  TEXT NOT NULL REFERENCES stock_media_assets(hash) ON DELETE CASCADE,
  project_id  TEXT,
  scene_id    TEXT,
  added_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_user_stock_usage_user ON user_stock_media_usage(user_id);
CREATE INDEX IF NOT EXISTS idx_user_stock_usage_asset ON user_stock_media_usage(asset_hash);
CREATE INDEX IF NOT EXISTS idx_user_stock_usage_project ON user_stock_media_usage(project_id);
