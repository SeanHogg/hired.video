-- Account Security Hardening — Phases 2–6
--
-- Three more tables that complete the security backbone:
--
-- bot_block_events
--   Append-only telemetry of every bot/abuse signal that fired. Drives
--   the SuperAdmin bot globe and the brute-force counter. Hashed IP +
--   email-domain only (no PII) so the audit log can live forever
--   without DSR concerns.
--
-- region_waitlist
--   Capture demand from users in countries we don't yet allow signup
--   for. SuperAdmin reviews + invites; not auto-converted to accounts.
--
-- two_factor_backup_codes
--   10 single-use rescue codes per user (NIST 800-63B §6.1.2.3).
--   Hashed at rest — only the SHA-256 digest is stored. Regenerable
--   from Security Settings; old codes invalidated on regenerate.

-- ─────────────────────────────────────────────────────────────────────
-- bot_block_events
-- ─────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS bot_block_events (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Endpoint that triggered the block ('register', 'login',
  -- 'forgot-password', 'verify-2fa', 'magic-link'). Short enum-ish
  -- string; not foreign-keyed because it represents app routes, not
  -- DB rows.
  endpoint        VARCHAR(64) NOT NULL,
  -- Why we blocked. Keep this column index-friendly so the bot globe
  -- can group-by reason without a join. Values:
  --   TURNSTILE_FAIL, HONEYPOT_HIT, RATE_LIMIT, DISPOSABLE_EMAIL,
  --   MX_FAIL, BREACHED_PASSWORD, GEO_BLOCKED, OFAC_BLOCKED,
  --   BRUTE_FORCE
  reason          VARCHAR(32) NOT NULL,
  country_code    VARCHAR(2),
  -- SHA-256 of the raw IP. We don't store plaintext IPs to keep the
  -- log GDPR-light; the hash is enough to count distinct attackers
  -- without identifying individuals.
  ip_hash         VARCHAR(64),
  -- Domain part of the email only, not the local part. Useful for
  -- "X% of blocks come from @gmail.com" without storing addresses.
  email_domain    VARCHAR(255),
  -- Optional ASN / hosting-provider classification if we have it.
  asn             VARCHAR(32),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bot_block_events_created_at
  ON bot_block_events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_bot_block_events_country
  ON bot_block_events(country_code, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_bot_block_events_reason
  ON bot_block_events(reason, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_bot_block_events_ip_hash
  ON bot_block_events(ip_hash, created_at DESC);

-- ─────────────────────────────────────────────────────────────────────
-- region_waitlist
-- ─────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS region_waitlist (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email           VARCHAR(255) NOT NULL,
  country_code    VARCHAR(2) NOT NULL,
  reason          TEXT,
  -- 'pending' | 'invited' | 'declined'. Set when admin actions the row.
  status          VARCHAR(32) NOT NULL DEFAULT 'pending',
  reviewed_by     UUID REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_region_waitlist_status
  ON region_waitlist(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_region_waitlist_country
  ON region_waitlist(country_code);
CREATE UNIQUE INDEX IF NOT EXISTS uq_region_waitlist_email_pending
  ON region_waitlist(email) WHERE status = 'pending';

-- ─────────────────────────────────────────────────────────────────────
-- two_factor_backup_codes
-- ─────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS two_factor_backup_codes (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  -- SHA-256 hash of the plaintext code. We display the plaintext to
  -- the user exactly once at generation time; after that only the hash
  -- is queryable.
  code_hash       VARCHAR(64) NOT NULL,
  -- Once consumed the row is left in place (audit) but flagged.
  used_at         TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_two_factor_backup_codes_user
  ON two_factor_backup_codes(user_id);
CREATE INDEX IF NOT EXISTS idx_two_factor_backup_codes_hash
  ON two_factor_backup_codes(code_hash) WHERE used_at IS NULL;
