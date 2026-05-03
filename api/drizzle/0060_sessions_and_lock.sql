-- Account Security Hardening — Phase 1
--
-- Three new tables that together replace the stateless-JWT-only model with
-- a real session backbone, an auditable lockout state, and a verified
-- email-change flow.
--
-- ─── Why each table ────────────────────────────────────────────────────
--
-- sessions
--   Authoritative per-device session row. Every login (password, OAuth,
--   magic-link, 2FA-completion) writes one. Required so we can:
--     * enforce a 3-device cap (oldest evicted on 4th login),
--     * revoke a specific device from /security/sessions,
--     * rotate refresh tokens with reuse detection (RFC 6749 §10.4),
--     * mark devices "trusted" so adaptive MFA can skip the OTP prompt
--       for known good devices.
--   The existing `refresh_tokens` table is left in place for OAuth-flow
--   compatibility but is being phased out — sessions supersedes it.
--
-- account_locks
--   Lock state lives in its own row so we keep an audit trail
--   (locked_by, unlocked_by, reason, notes). Putting these on `users`
--   would lose history every time a lock was cleared. The active partial
--   unique index guarantees one open lock per user without ambiguity.
--
-- email_change_requests
--   Email change is a hijack vector — an attacker who steals an
--   active session must NOT be able to silently change the email and
--   lock the real owner out. We require the *current* email to confirm
--   the change AND the *new* email to verify ownership before mutation.
--   Both tokens must be consumed for the swap to land.

-- ─────────────────────────────────────────────────────────────────────
-- sessions
-- ─────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS sessions (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                 UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  -- family_id groups every refresh-rotation descendant of one initial
  -- login. If a refresh token is presented twice (token theft signal),
  -- we revoke the entire family in one shot. RFC 6749 §10.4.
  family_id               UUID NOT NULL,
  -- SHA-256 of the opaque refresh-token secret. We never store the
  -- plaintext — clients hold it; we hash on lookup.
  refresh_token_hash      TEXT NOT NULL UNIQUE,
  -- Stable per-device identifier sent by the client (cookie or
  -- localStorage UUID). Allows a returning device to reuse its session
  -- slot rather than burning a new one each login.
  device_fingerprint      TEXT,
  -- Human-readable label derived from the User-Agent ("Chrome on macOS")
  -- shown on the /security/sessions page so users know what they're
  -- looking at without parsing UA strings themselves.
  device_label            TEXT,
  ip_address              VARCHAR(45),
  ip_country              VARCHAR(2),
  user_agent              TEXT,
  -- trusted=true → adaptive MFA skips the OTP prompt for this device
  -- until trusted_until elapses. Set when the user successfully passes
  -- a 2FA challenge AND ticks "trust this device for 30 days".
  trusted                 BOOLEAN NOT NULL DEFAULT false,
  trusted_until           TIMESTAMPTZ,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- last_seen_at is bumped on every authenticated request through the
  -- session middleware (debounced to once/minute to avoid thrashing
  -- the row). Drives the sliding 14-day idle revoke + the "Last active"
  -- column on the sessions UI.
  last_seen_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Absolute expiry — 30 days for normal sessions, longer for
  -- "remember me". Hard cap regardless of last_seen_at.
  expires_at              TIMESTAMPTZ NOT NULL,
  revoked_at              TIMESTAMPTZ,
  -- Why this session ended. Free-form short codes:
  -- 'logout', 'rotated', 'replaced_by_cap', 'family_revoked',
  -- 'password_reset', 'admin_revoke', 'idle_timeout', 'expired'.
  revoked_reason          VARCHAR(64),
  -- Forward pointer set when this session is rotated. The successor's
  -- own row is inserted, this one's revoked_at is stamped, and
  -- rotated_to_session_id links the chain so we can walk a family.
  rotated_to_session_id   UUID
);

-- Add the self-FK after the table exists so the CREATE works on a fresh DB.
ALTER TABLE sessions
  ADD CONSTRAINT sessions_rotated_to_fk
  FOREIGN KEY (rotated_to_session_id) REFERENCES sessions(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_sessions_user_active
  ON sessions(user_id) WHERE revoked_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_sessions_family
  ON sessions(family_id);
CREATE INDEX IF NOT EXISTS idx_sessions_last_seen
  ON sessions(last_seen_at);
CREATE INDEX IF NOT EXISTS idx_sessions_expires_at
  ON sessions(expires_at) WHERE revoked_at IS NULL;

-- ─────────────────────────────────────────────────────────────────────
-- account_locks
-- ─────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS account_locks (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  -- Short machine code: 'brute_force', 'admin_manual', 'bot_signal',
  -- 'compromised_credentials', 'support_request'.
  reason          VARCHAR(64) NOT NULL,
  -- NULL for system-generated locks (e.g. brute-force auto-lock); set
  -- to the SuperAdmin's user_id for manual locks. Powers the audit
  -- column "Locked by" in the SuperAdmin UI.
  locked_by       UUID REFERENCES users(id) ON DELETE SET NULL,
  unlocked_by     UUID REFERENCES users(id) ON DELETE SET NULL,
  notes           TEXT,
  locked_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- When auto-unlock should clear this lock. NULL = manual-only unlock
  -- (admin must intervene). Brute-force locks set this to locked_at +
  -- 15 minutes; manual admin locks leave it NULL by default.
  unlocks_at      TIMESTAMPTZ,
  unlocked_at     TIMESTAMPTZ,
  active          BOOLEAN NOT NULL DEFAULT true
);

-- Only one active lock per user at a time. Inactive history rows pile
-- up freely so we keep the timeline.
CREATE UNIQUE INDEX IF NOT EXISTS uq_account_locks_active_user
  ON account_locks(user_id) WHERE active = true;
CREATE INDEX IF NOT EXISTS idx_account_locks_unlocks_at
  ON account_locks(unlocks_at) WHERE active = true;

-- ─────────────────────────────────────────────────────────────────────
-- email_change_requests
-- ─────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS email_change_requests (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  -- Snapshotted at request time so a token landing later still applies
  -- to the email pair the user originally confirmed, even if the user
  -- row has been mutated meanwhile.
  current_email     VARCHAR(255) NOT NULL,
  new_email         VARCHAR(255) NOT NULL,
  current_token     TEXT NOT NULL UNIQUE,
  new_token         TEXT NOT NULL UNIQUE,
  current_confirmed BOOLEAN NOT NULL DEFAULT false,
  new_confirmed     BOOLEAN NOT NULL DEFAULT false,
  expires_at        TIMESTAMPTZ NOT NULL,
  consumed_at       TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_email_change_requests_user
  ON email_change_requests(user_id);
