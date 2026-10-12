-- Migration 0204 — Email campaign engine.
--
-- Turns the previously-inert email_campaigns table (CRUD-only, no send path)
-- into a real engine: an audience the cron worker resolves to recipients, an
-- inline body OR template, a sender company (hired.video for SuperAdmin
-- marketing blasts), and a global unsubscribe/suppression list for CAN-SPAM.
--
-- See shared/campaigns.ts for the SSoT status enum, audience discriminated
-- union, and DTO shapes. Idempotent per drizzle/TEMPLATE.md.

-- ── email_campaigns: engine columns ────────────────────────────────────────
ALTER TABLE email_campaigns ADD COLUMN IF NOT EXISTS description        VARCHAR(1000);
ALTER TABLE email_campaigns ADD COLUMN IF NOT EXISTS html_body          TEXT;
ALTER TABLE email_campaigns ADD COLUMN IF NOT EXISTS from_name          VARCHAR(255);
ALTER TABLE email_campaigns ADD COLUMN IF NOT EXISTS audience           JSONB;
ALTER TABLE email_campaigns ADD COLUMN IF NOT EXISTS sender_company_id  UUID;
ALTER TABLE email_campaigns ADD COLUMN IF NOT EXISTS created_by_user_id UUID;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'email_campaigns_created_by_user_id_fk'
  ) THEN
    ALTER TABLE email_campaigns
      ADD CONSTRAINT email_campaigns_created_by_user_id_fk
      FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE SET NULL;
  END IF;
END $$;

-- The cron send worker claims campaigns where status='scheduled' AND
-- scheduled_at <= now() — index that hot predicate.
CREATE INDEX IF NOT EXISTS idx_email_campaigns_status_scheduled
  ON email_campaigns (status, scheduled_at);

-- ── email_campaign_recipients: per-recipient snapshot + failure reason ──────
ALTER TABLE email_campaign_recipients ADD COLUMN IF NOT EXISTS name            VARCHAR(255);
ALTER TABLE email_campaign_recipients ADD COLUMN IF NOT EXISTS personalization JSONB;
ALTER TABLE email_campaign_recipients ADD COLUMN IF NOT EXISTS error_message   TEXT;

-- The send loop drains pending recipients per campaign — index the scan.
CREATE INDEX IF NOT EXISTS idx_campaign_recipients_campaign_status
  ON email_campaign_recipients (campaign_id, status);

-- One recipient row per (campaign, email) so re-running audience resolve on a
-- resumed send is idempotent (ON CONFLICT DO NOTHING).
CREATE UNIQUE INDEX IF NOT EXISTS uq_campaign_recipients_campaign_email
  ON email_campaign_recipients (campaign_id, email);

-- ── email_suppressions: global do-not-email list ────────────────────────────
CREATE TABLE IF NOT EXISTS email_suppressions (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email        VARCHAR(255) NOT NULL UNIQUE,
  reason       VARCHAR(64)  NOT NULL DEFAULT 'unsubscribe',
  campaign_id  UUID REFERENCES email_campaigns(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT now()
);
