-- Migration 0217 — social publishing connection layers (PRD §5.0, gaps #2043/#2044/#2051).
--
-- The connection layer the two-lane publishing system depends on. Two tables:
--
--   social_connections  — Layer 3: each end user's OWN connected account
--                         (Lane B). One row per (owner, platform). OAuth
--                         access/refresh tokens stored ENCRYPTED at rest
--                         (envelope encryption against SOCIAL_KMS_KEY via the
--                         shared crypto seam) — never read raw; route through
--                         services/social/secrets.ts.
--
--   managed_accounts    — Layer 2: hired.video's OWN per-platform brand
--                         accounts (Lane A, free). SuperAdmin-connected,
--                         platform-global (NOT tenant-scoped). One row per
--                         platform. Same encrypted-token shape.
--
-- Layer 1 (the developer-app client_id/client_secret) is NOT a table — those
-- are Worker Secrets (see wrangler.toml + services/social/platform-config.ts).
--
-- Ownership: social_connections rows carry (user_id, company_id) gated by
-- services/studio/workspace.ts → canActFor(), same as paid_media_connections.
--
-- Idempotent per drizzle/TEMPLATE.md.

CREATE TABLE IF NOT EXISTS social_connections (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                  UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  company_id               UUID,                                  -- workspace company (null = personal)
  platform                 VARCHAR(16) NOT NULL,                  -- shared SocialPlatform id
  external_account_id      TEXT,                                  -- platform's account id
  handle                   TEXT,                                  -- human label shown in UI
  avatar_url               TEXT,
  access_token_enc         TEXT NOT NULL,                         -- envelope-encrypted
  refresh_token_enc        TEXT,                                  -- envelope-encrypted
  access_token_expires_at  TIMESTAMPTZ,
  scopes                   TEXT NOT NULL DEFAULT '',
  status                   VARCHAR(24) NOT NULL DEFAULT 'active', -- active | expired | revoked | error
  last_error               TEXT,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_social_connections_owner ON social_connections (user_id, company_id);
CREATE INDEX IF NOT EXISTS idx_social_connections_platform ON social_connections (platform);
-- One connection per (workspace owner, platform). NULL company_id collapses
-- to a single personal row per user+platform via COALESCE on the index.
CREATE UNIQUE INDEX IF NOT EXISTS uq_social_connection_owner_platform
  ON social_connections (user_id, COALESCE(company_id, '00000000-0000-0000-0000-000000000000'::uuid), platform);

CREATE TABLE IF NOT EXISTS managed_accounts (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  platform                 VARCHAR(16) NOT NULL,                  -- shared SocialPlatform id
  external_account_id      TEXT,
  handle                   TEXT,
  avatar_url               TEXT,
  access_token_enc         TEXT NOT NULL,
  refresh_token_enc        TEXT,
  access_token_expires_at  TIMESTAMPTZ,
  scopes                   TEXT NOT NULL DEFAULT '',
  status                   VARCHAR(24) NOT NULL DEFAULT 'active',
  last_error               TEXT,
  -- SuperAdmin who connected/last-refreshed this brand account (audit).
  connected_by_user_id     UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Platform-global: exactly one brand account per platform.
CREATE UNIQUE INDEX IF NOT EXISTS uq_managed_accounts_platform ON managed_accounts (platform);
