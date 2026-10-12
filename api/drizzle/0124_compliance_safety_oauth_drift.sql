-- Migration 0124 — Compliance workspace + Email-safety slider +
-- Enrichment policy + OAuth schema drift fixup + Helcim expiry. Bundle
-- closes gaps #244, #245, #264, #386, #389. Naming convention #388
-- (rename stripe-leaked columns) is split into a dedicated migration
-- 0125 because it has a backfill phase + code rename + grace period.

-- ─── #244 — Compliance workspace tenant policy ────────────────────────
-- One row per workspace. Tenant-scoped policy consolidating GDPR scope,
-- lawful basis, retention period, EEOC scope, SMS-consent toggle,
-- bulk-unsubscribe-injection toggle. Wires the existing
-- `privacy_preferences` per-user table to a workspace-wide policy.
CREATE TABLE IF NOT EXISTS "workspace_compliance_policy" (
  "workspace_id"             uuid PRIMARY KEY,
  -- 'all' | 'eu_only' | 'off' — drives whether GDPR controls (data
  -- export, right-to-be-forgotten cron, consent prompts) apply to the
  -- whole tenant, just EU residents, or are disabled (e.g. a US-only
  -- workspace where the operator opts out).
  "gdpr_scope"               varchar(16) NOT NULL DEFAULT 'all',
  -- 'legitimate_interest' | 'consent' — lawful basis for storing
  -- archived candidates' personal data per GDPR Article 6.
  "gdpr_lawful_basis"        varchar(32) NOT NULL DEFAULT 'legitimate_interest',
  -- Days the workspace keeps archived candidates before the purge
  -- cron drops them. 0 = never purge.
  "retention_days"           integer NOT NULL DEFAULT 730,
  -- Optional public link to the workspace's privacy policy. Surfaces
  -- in candidate-facing consent prompts.
  "privacy_policy_url"       text,
  -- 'us' | 'eu' | 'off' — EEOC voluntary self-id collection scope.
  "eeoc_scope"               varchar(8) NOT NULL DEFAULT 'us',
  -- SMS consent: when true, any outbound SMS path checks the ledger
  -- and blocks sends without an active opt-in.
  "sms_consent_required"     boolean NOT NULL DEFAULT true,
  -- When true, outreach campaigns ≥ 10 recipients auto-inject an
  -- unsubscribe footer (CAN-SPAM safety net).
  "bulk_unsubscribe_injection" boolean NOT NULL DEFAULT true,
  "updated_at"               timestamptz NOT NULL DEFAULT now()
);

-- ─── #245 — Email safety tolerance slider ─────────────────────────────
-- Tenant preference drives daily caps + min-interval-between-sends for
-- outreach + transactional. Cron honours both and auto-downgrades on
-- bounce-rate / complaint-rate spikes.
CREATE TABLE IF NOT EXISTS "workspace_email_safety_policy" (
  "workspace_id"           uuid PRIMARY KEY,
  -- 'safe' | 'moderate' | 'high' | 'risky' — the slider notch picked
  -- by the operator. The cron-side daily caps + interval floors are
  -- derived from this single value (see email-safety.ts).
  "tier"                   varchar(16) NOT NULL DEFAULT 'moderate',
  -- Set by the auto-throttle when bounce-rate or complaint-rate
  -- breach the per-tier ceiling. Null = no auto-downgrade in effect.
  -- Surfaces in Settings → Outreach so the operator knows their
  -- effective tier differs from their slider.
  "auto_downgraded_to"     varchar(16),
  "auto_downgraded_at"     timestamptz,
  "auto_downgrade_reason"  text,
  "updated_at"             timestamptz NOT NULL DEFAULT now()
);

-- ─── #264 — Enrichment policy: catch-all + unknown email toggles ──────
ALTER TABLE "workspace_compliance_policy"
  ADD COLUMN IF NOT EXISTS "enrichment_allow_catch_all" boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "enrichment_allow_unknown"   boolean NOT NULL DEFAULT false;

-- ─── #386 — Helcim card expiry on payment_methods ─────────────────────
-- Two small columns the saver writes whenever the success postMessage
-- (eventually) includes them, or the `/v2/customers/{code}/cards`
-- listing pulls them post-tokenisation. Nullable so legacy rows stay
-- as "Expires —/—" until next card-save cycle.
ALTER TABLE "payment_methods"
  ADD COLUMN IF NOT EXISTS "expiry_month" integer,
  ADD COLUMN IF NOT EXISTS "expiry_year"  integer;

-- ─── #389 — OAuth schema drift fixup ──────────────────────────────────
-- Mirror of 0076's `youtube_accounts` drift fix on `linkedin_accounts`
-- and `calendar_connections`. Both tables likely missed the canonical
-- `oauthConnectionColumns` helper set if they were created in prod via
-- an early `drizzle-kit push` before the helper was canonicalised.
-- IF NOT EXISTS so re-running the migration is a no-op on clean envs.
DO $$ BEGIN
  IF EXISTS (
    SELECT FROM information_schema.tables WHERE table_name = 'linkedin_accounts'
  ) THEN
    EXECUTE 'ALTER TABLE linkedin_accounts
               ADD COLUMN IF NOT EXISTS scopes text,
               ADD COLUMN IF NOT EXISTS token_expires_at timestamptz,
               ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true,
               ADD COLUMN IF NOT EXISTS provider_user_id varchar(255)';
  END IF;
  IF EXISTS (
    SELECT FROM information_schema.tables WHERE table_name = 'calendar_connections'
  ) THEN
    EXECUTE 'ALTER TABLE calendar_connections
               ADD COLUMN IF NOT EXISTS scopes text,
               ADD COLUMN IF NOT EXISTS token_expires_at timestamptz,
               ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true,
               ADD COLUMN IF NOT EXISTS provider_user_id varchar(255)';
  END IF;
END $$;

-- ─── #535 — Gmail Push / Outlook Graph subscription tracking ─────────
-- Push subscription IDs + renewal cron metadata. The renewal worker
-- looks up rows where `expires_at < now() + interval '1 day'` (Gmail
-- watches expire every 7 days; Graph subscriptions every ~70 minutes).
-- Pairs with the existing `push_expires_at` column added in P1; this
-- table is the cross-provider source-of-truth so the worker doesn't
-- have to discriminate by row shape.
CREATE TABLE IF NOT EXISTS "email_push_subscriptions" (
  "id"               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "account_id"       uuid NOT NULL,
  -- 'gmail' | 'outlook' — matches `external_email_accounts.provider`.
  "provider"         varchar(16) NOT NULL,
  -- Gmail: the topic name + history_id watermark.
  -- Outlook: the Graph subscription id + clientState.
  "provider_subscription_id" varchar(255) NOT NULL,
  "expires_at"       timestamptz NOT NULL,
  "client_state"     text,
  "history_id"       varchar(64),
  "renewed_at"       timestamptz NOT NULL DEFAULT now(),
  "created_at"       timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "uq_email_push_subscriptions_account"
  ON "email_push_subscriptions" ("account_id");
CREATE INDEX IF NOT EXISTS "idx_email_push_subscriptions_expires_at"
  ON "email_push_subscriptions" ("expires_at");
