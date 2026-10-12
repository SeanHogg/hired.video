-- Migration 0512 — uploaded_assets: one row per R2 object a user uploads or
-- the platform generates for them (gaps #733, #950).
--
-- Until now uploads under uploads/{userId}/... (images, videos, files,
-- avatars, AI images), studio recordings and voice samples were PUT to R2
-- with no DB row, so the media library had to list R2 prefixes (100 newest,
-- no pagination, no metadata) and nothing could reclaim a replaced avatar or
-- a discarded AI image. `putObject` (services/storage/object-store.ts), the
-- ONE R2 write path, now records every user-owned object here.
--
-- kind values mirror shared/uploaded-assets.ts UPLOADED_ASSET_KINDS.
-- r2_key is unique: an overwrite of the same key updates the row.
-- The library reads (user_id, kind) newest first with a keyset cursor on
-- (created_at DESC, id DESC).
--
-- New table, so there are no existing rows to dedupe before the unique index.
-- Idempotent: IF NOT EXISTS throughout. Indexes + CHECKs are declared in
-- db/schema/uploadedAssets.ts (CI `drizzle-kit push` drops undeclared ones).

CREATE TABLE IF NOT EXISTS uploaded_assets (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  r2_key             text NOT NULL,
  kind               varchar(16) NOT NULL,
  content_type       varchar(127) NOT NULL,
  size_bytes         bigint NOT NULL,
  width              integer,
  height             integer,
  source_project_id  uuid REFERENCES studio_projects(id) ON DELETE SET NULL,
  -- Millisecond precision: the keyset cursor round-trips through a JS Date.
  created_at         timestamptz(3) NOT NULL DEFAULT now(),
  CONSTRAINT uploaded_assets_kind_check
    CHECK (kind IN ('image', 'ai_image', 'avatar', 'video', 'recording', 'audio', 'voice', 'file', 'scorm')),
  CONSTRAINT uploaded_assets_size_check CHECK (size_bytes >= 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_uploaded_assets_r2_key ON uploaded_assets (r2_key);

-- Media library: a user's assets of a kind, newest first, keyset-paginated.
CREATE INDEX IF NOT EXISTS idx_uploaded_assets_user_kind_created
  ON uploaded_assets (user_id, kind, created_at DESC, id DESC);
