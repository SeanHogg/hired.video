-- 0081 — email-integration plumbing (P1) + rules (P2) + sync runs (P4)
--
-- Builds on 0080:
--   • adds delta-sync cursors to external_email_accounts (Gmail historyId,
--     Outlook deltaLink) so the sync worker resumes per-account without
--     re-pulling history every tick.
--   • adds apply_url + dedup_score to external_email_messages so the
--     auto-create job pipeline (P3) has a target URL + a stored confidence
--     for the dedup decision.
--   • new email_user_rules — per-user classification rules (P2 user editor).
--   • new email_sync_runs — per-account sync recap (P4 digest source).
--
-- The default ruleset (ATS senders, spam heuristics) lives in code, not
-- the DB — it doesn't change per user and version-controls cleanly.

ALTER TABLE external_email_accounts
  ADD COLUMN IF NOT EXISTS last_history_id varchar(64),
  ADD COLUMN IF NOT EXISTS last_delta_link text,
  ADD COLUMN IF NOT EXISTS scopes jsonb;

ALTER TABLE external_email_messages
  ADD COLUMN IF NOT EXISTS apply_url text,
  ADD COLUMN IF NOT EXISTS dedup_score numeric(4,3),
  ADD COLUMN IF NOT EXISTS dedup_method varchar(32);  -- 'company_title' | 'apply_url' | 'thread_id' | 'auto_created' | NULL


CREATE TABLE IF NOT EXISTS email_user_rules (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name                varchar(120) NOT NULL,
  -- Match conditions stored as jsonb so the editor can ship richer rules
  -- without further migrations. Schema enforced at the service layer
  -- (services/email-integration/rules.ts).
  conditions          jsonb NOT NULL DEFAULT '[]',
  -- Action emitted by Stage-1 when this rule matches. Stage-2 LLM is
  -- skipped for the message when a user rule fires.
  action_category     varchar(40) NOT NULL,            -- 'job_opportunity' | 'application_status' | 'recruiter_outreach' | 'spam' | 'archive' | ...
  action_score        numeric(4,3) NOT NULL DEFAULT 1, -- confidence applied by the rule
  is_enabled          boolean NOT NULL DEFAULT true,
  priority            integer NOT NULL DEFAULT 100,    -- lower = evaluated first
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS email_user_rules_user_priority_idx
  ON email_user_rules (user_id, is_enabled, priority);


CREATE TABLE IF NOT EXISTS email_sync_runs (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  account_id          uuid NOT NULL REFERENCES external_email_accounts(id) ON DELETE CASCADE,
  started_at          timestamptz NOT NULL DEFAULT now(),
  completed_at        timestamptz,
  status              varchar(16) NOT NULL DEFAULT 'running',  -- 'running' | 'success' | 'partial' | 'error'
  messages_synced     integer NOT NULL DEFAULT 0,
  messages_classified integer NOT NULL DEFAULT 0,
  jobs_linked         integer NOT NULL DEFAULT 0,
  jobs_created        integer NOT NULL DEFAULT 0,
  digest_summary      text,                             -- comprehensive summary written by P4 digest pass
  error_message       text
);

CREATE INDEX IF NOT EXISTS email_sync_runs_user_started_idx
  ON email_sync_runs (user_id, started_at DESC);

CREATE INDEX IF NOT EXISTS email_sync_runs_account_started_idx
  ON email_sync_runs (account_id, started_at DESC);
