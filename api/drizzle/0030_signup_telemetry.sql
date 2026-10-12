-- Migration: 0030_signup_telemetry
--
-- Spam-investigation telemetry. Driven by an incident where a single
-- attacker created multiple accounts whose tagline was a bit.ly link
-- ("Tap to Win — 85,000 Lira Ready for You!"). The data needed to
-- attribute those accounts back to a network was already in
-- `request_logs` (general per-request telemetry), but joining
-- request_logs by timestamp+email is brittle and doesn't survive log
-- retention. This migration adds:
--
--   1. `users.signup_ip` + `users.signup_user_agent` — pin the original
--      registration network attribution to the user row itself, so an
--      admin can answer "where did this account come from?" in one
--      query, regardless of request-log retention.
--   2. `login_events` — append-only log of login + register attempts
--      (success AND failure, password + OAuth + magic-link). Lets the
--      admin investigation page surface "10 signups from this /24 in
--      the last hour" or "this email was hammered with failed logins
--      from 9 IPs" without scanning the catch-all `request_logs`.
--   3. Indexes tuned for the actual investigation queries: by IP+time
--      (spam wave detection), by user+time (per-user history), by
--      email+time (failed-login forensics).

-- ─── 1. signup attribution on users ──────────────────────────────────────────
ALTER TABLE users ADD COLUMN IF NOT EXISTS signup_ip varchar(45);
ALTER TABLE users ADD COLUMN IF NOT EXISTS signup_user_agent text;

-- Index supports "find every account that registered from this IP".
-- Partial index (WHERE NOT NULL) keeps it small — pre-migration users
-- have NULL and don't need to be searchable.
CREATE INDEX IF NOT EXISTS idx_users_signup_ip
  ON users (signup_ip)
  WHERE signup_ip IS NOT NULL;

-- ─── 2. login_events table ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS login_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- user_id is nullable: failed logins for nonexistent emails (a common
  -- credential-stuffing signal) still get a row, just with user_id=NULL.
  -- ON DELETE SET NULL so deleting a banned spammer preserves the
  -- forensic trail (matches the admin_audit_log pattern in 0029).
  user_id uuid REFERENCES users(id) ON DELETE SET NULL,

  -- email is captured even on failure / nonexistent-user attempts so
  -- "this email was probed by 9 IPs" queries work without joining users.
  email varchar(255),

  -- 'register' | 'login' | 'oauth_login' | 'magic_link'. Free-form
  -- varchar instead of an enum so adding new auth flows doesn't need a
  -- migration.
  kind varchar(32) NOT NULL,

  -- 'password' | 'google' | 'linkedin' | 'github' | 'microsoft' |
  -- 'magic_link' | NULL (for register/email-password). Same rationale
  -- as `kind` for using varchar over enum.
  provider varchar(32),

  ip_address varchar(45),
  user_agent text,

  success boolean NOT NULL,

  -- Short machine-readable failure code: 'invalid_password',
  -- 'unknown_email', 'account_disabled', 'account_suspended',
  -- 'rate_limited', 'captcha_failed', 'oauth_state_mismatch', etc.
  -- Free-form so handlers can add codes without a migration.
  failure_reason varchar(64),

  created_at timestamptz NOT NULL DEFAULT now()
);

-- Investigation queries always filter recent-first by one dimension,
-- so each index leads with that dimension and tails on time DESC.
CREATE INDEX IF NOT EXISTS idx_login_events_ip_time
  ON login_events (ip_address, created_at DESC)
  WHERE ip_address IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_login_events_user_time
  ON login_events (user_id, created_at DESC)
  WHERE user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_login_events_email_time
  ON login_events (lower(email), created_at DESC)
  WHERE email IS NOT NULL;
