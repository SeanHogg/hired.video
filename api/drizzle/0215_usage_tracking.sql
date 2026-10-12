-- Migration 0215 — usage tracking sessions + events (gaps #2043-2046).
--
-- Page/session/event analytics behind the "who is active, engage them"
-- surface. Distinct from usage_ledger (billing meter). A visitor exists before
-- login (visitor_id cookie); on auth the session links to user_id, retaining
-- the pre-signup journey. Events carry the Feature Registry key where
-- applicable so usage rolls up by the same per-role/per-feature vocabulary.
--
-- Privacy: marketing-visitor tracking is consent-gated client-side; the
-- ingestion route stores nothing when consent is false. visitor_id/user_id are
-- erasable (DSR) via UsageService.eraseForVisitor/eraseForUser.
--
-- See shared/usage.ts for the wire shape. Idempotent per drizzle/TEMPLATE.md.

CREATE TABLE IF NOT EXISTS usage_sessions (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  visitor_id       VARCHAR(64)  NOT NULL,
  user_id          UUID REFERENCES users(id) ON DELETE SET NULL,
  is_authenticated BOOLEAN      NOT NULL DEFAULT false,
  role             VARCHAR(50),
  entry_path       TEXT,
  referrer         TEXT,
  utm_source       VARCHAR(200),
  utm_medium       VARCHAR(200),
  utm_campaign     VARCHAR(200),
  country          VARCHAR(8),
  user_agent       TEXT,
  -- Denormalised latest activity so the presence read hits one table.
  last_event_type  VARCHAR(32),
  last_path        TEXT,
  first_seen       TIMESTAMPTZ  NOT NULL DEFAULT now(),
  last_seen        TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- One session row per visitor — the ingestion upsert targets this.
CREATE UNIQUE INDEX IF NOT EXISTS uq_usage_sessions_visitor ON usage_sessions (visitor_id);
-- Presence read: "active in the last N minutes".
CREATE INDEX IF NOT EXISTS idx_usage_sessions_last_seen ON usage_sessions (last_seen);
CREATE INDEX IF NOT EXISTS idx_usage_sessions_user ON usage_sessions (user_id);

CREATE TABLE IF NOT EXISTS usage_events (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id  UUID NOT NULL REFERENCES usage_sessions(id) ON DELETE CASCADE,
  type        VARCHAR(32) NOT NULL,
  path        TEXT,
  feature_key VARCHAR(200),
  payload     JSONB,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_usage_events_session ON usage_events (session_id);
CREATE INDEX IF NOT EXISTS idx_usage_events_type_time ON usage_events (type, occurred_at);
CREATE INDEX IF NOT EXISTS idx_usage_events_feature ON usage_events (feature_key);
