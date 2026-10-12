-- Migration 0205 — Email marketing consent ledger + campaign category.
--
-- Makes marketing email CAN-SPAM compliant end to end: an email-keyed consent
-- ledger (covers users AND leads/list recipients), an opaque token for the
-- unsubscribe link (no email/PII in the URL), a master opt-out + per-category
-- choices, and a `category` on each campaign so opt-outs are granular.
--
-- The existing `email_suppressions` (0204) stays as the HARD, system-set,
-- non-user-reversible list (bounces/complaints); this ledger is the soft,
-- user-managed one. See shared/email-consent.ts for the SSoT category taxonomy
-- + opt-out resolution rules. Idempotent per drizzle/TEMPLATE.md.

-- ── Campaign marketing category ─────────────────────────────────────────────
ALTER TABLE email_campaigns
  ADD COLUMN IF NOT EXISTS category VARCHAR(32) NOT NULL DEFAULT 'product_launches';

-- ── Consent ledger ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS email_marketing_preferences (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email            VARCHAR(255) NOT NULL UNIQUE,
  user_id          UUID REFERENCES users(id) ON DELETE SET NULL,
  -- Opaque, unguessable bearer key embedded in unsubscribe links.
  token            VARCHAR(64)  NOT NULL UNIQUE,
  -- Master kill switch. Missing row entirely = fully subscribed.
  unsubscribed_all BOOLEAN      NOT NULL DEFAULT false,
  -- Explicit per-category choices: {"<category>": false} = opted out.
  categories       JSONB        NOT NULL DEFAULT '{}'::jsonb,
  unsubscribed_at  TIMESTAMPTZ,
  resubscribed_at  TIMESTAMPTZ,
  source           VARCHAR(64),
  created_at       TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- Token lookup is the hot path for the unsubscribe / preference page.
CREATE UNIQUE INDEX IF NOT EXISTS uq_email_marketing_prefs_token
  ON email_marketing_preferences (token);
