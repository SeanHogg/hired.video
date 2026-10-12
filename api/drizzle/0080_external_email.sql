-- 0080 — external_email_accounts + external_email_messages (Inbox external sources)
--
-- Foundation for the multi-inbox sync feature: candidates connect 1+ Gmail /
-- Outlook accounts and synced messages flow into the unified Communication
-- Hub inbox alongside conversations, notifications, and connection requests.
--
-- This migration ships the SHAPE only. Both tables stay empty until the
-- email-integration phase wires up OAuth, Gmail Push / Graph subscriptions,
-- and the classifier worker. Shipping the schema now lets the read-side
-- aggregator (services/messaging/inboxService.ts) and the frontend hub
-- ingest a fourth source with no further migration churn.
--
-- Categorization, scoring, summary, and linkedJobId are nullable on
-- external_email_messages because the classifier and dedup workers fill
-- them in later phases. The aggregator must tolerate any of those being
-- null and render the row with whatever's present.

CREATE TABLE IF NOT EXISTS external_email_accounts (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                  uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider                 varchar(16) NOT NULL,                 -- 'gmail' | 'outlook'
  account_email            varchar(320) NOT NULL,                -- canonical mailbox addr
  account_label            varchar(120),                         -- user-chosen ("Work", "Personal")
  oauth_refresh_token_enc  text,                                 -- encrypted; populated by sync phase
  push_subscription_id     varchar(255),                         -- Gmail watch / Graph subscription id
  push_expires_at          timestamptz,                          -- watch/subscription expiry — needs renewal cron
  last_synced_at           timestamptz,
  status                   varchar(16) NOT NULL DEFAULT 'active',-- 'active' | 'paused' | 'error'
  last_error               text,
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, provider, account_email)
);

CREATE INDEX IF NOT EXISTS external_email_accounts_user_status_idx
  ON external_email_accounts (user_id, status);

CREATE INDEX IF NOT EXISTS external_email_accounts_push_expiry_idx
  ON external_email_accounts (push_expires_at)
  WHERE status = 'active' AND push_expires_at IS NOT NULL;


CREATE TABLE IF NOT EXISTS external_email_messages (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                  uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  account_id               uuid NOT NULL REFERENCES external_email_accounts(id) ON DELETE CASCADE,
  provider                 varchar(16) NOT NULL,                 -- denormalised for read-side filtering
  provider_message_id      varchar(255) NOT NULL,                -- gmail msg id / graph internetMessageId
  provider_thread_id       varchar(255),                         -- thread/conversation id when present

  from_email               varchar(320) NOT NULL,
  from_name                varchar(255),
  subject                  text,
  snippet                  text,                                 -- ~200 char preview
  body_html                text,
  body_text                text,
  received_at              timestamptz NOT NULL,

  -- Classifier output (nullable — filled by P2)
  category                 varchar(40),                          -- 'job_opportunity' | 'application_status' | 'recruiter_outreach' | 'spam' | ...
  score                    numeric(4,3),                         -- 0.000–1.000
  summary                  text,

  -- Dedup output (nullable — filled by P3)
  linked_job_id            uuid REFERENCES job_items(id) ON DELETE SET NULL,

  is_read                  boolean NOT NULL DEFAULT false,
  is_archived              boolean NOT NULL DEFAULT false,
  raw_metadata             jsonb,                                -- provider-specific extras (labelIds, headers, etc.)

  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now(),

  UNIQUE (account_id, provider_message_id)
);

-- Inbox aggregator read pattern: newest non-archived per user.
CREATE INDEX IF NOT EXISTS external_email_messages_user_inbox_idx
  ON external_email_messages (user_id, is_archived, received_at DESC);

-- Dedup lookup against applied/followed jobs.
CREATE INDEX IF NOT EXISTS external_email_messages_linked_job_idx
  ON external_email_messages (linked_job_id)
  WHERE linked_job_id IS NOT NULL;

-- Per-account sync cursor: "give me the newest message I have for this account".
CREATE INDEX IF NOT EXISTS external_email_messages_account_received_idx
  ON external_email_messages (account_id, received_at DESC);
