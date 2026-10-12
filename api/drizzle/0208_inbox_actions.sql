-- 0208_inbox_actions.sql
-- Role-aware inbox processors — Phase 3: action engine core (#1981).
--
--   • inbox_actions      — per-profile (trigger)→handler config
--   • inbox_action_runs  — append-only audit, idempotent on (message_id, action_id)
--
-- The L2 seam: classification (L1, cheap, per-email) stays separate from
-- CRM mutation (L2, auditable). Trigger/handler/status vocabularies mirror
-- shared/email-classification/actions.ts.
-- Idempotent per drizzle/TEMPLATE.md.

-- ── inbox_actions ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS inbox_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID NOT NULL REFERENCES inbox_profiles(id) ON DELETE CASCADE,
  owner_id UUID REFERENCES users(id) ON DELETE CASCADE,
  name VARCHAR(120) NOT NULL,
  trigger_type VARCHAR(24) NOT NULL,
  trigger_value VARCHAR(120),
  handler VARCHAR(32) NOT NULL,
  config JSONB,
  is_enabled BOOLEAN NOT NULL DEFAULT true,
  priority INTEGER NOT NULL DEFAULT 100,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS inbox_actions_profile_enabled_idx
  ON inbox_actions(profile_id, is_enabled, priority);
CREATE INDEX IF NOT EXISTS inbox_actions_owner_idx ON inbox_actions(owner_id);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'inbox_actions_trigger_type_check') THEN
    ALTER TABLE inbox_actions
      ADD CONSTRAINT inbox_actions_trigger_type_check
      CHECK (trigger_type IN ('category', 'rule', 'always')) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'inbox_actions_handler_check') THEN
    ALTER TABLE inbox_actions
      ADD CONSTRAINT inbox_actions_handler_check
      CHECK (handler IN (
        'notify', 'upsert_contact', 'link_to_pipeline',
        'create_sourcing_lead', 'draft_tailored_jd', 'webhook'
      )) NOT VALID;
  END IF;
END $$;

-- ── inbox_action_runs ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS inbox_action_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  message_id UUID NOT NULL REFERENCES external_email_messages(id) ON DELETE CASCADE,
  action_id UUID NOT NULL REFERENCES inbox_actions(id) ON DELETE CASCADE,
  profile_id UUID REFERENCES inbox_profiles(id) ON DELETE SET NULL,
  handler VARCHAR(32) NOT NULL,
  status VARCHAR(16) NOT NULL,
  target_type VARCHAR(32),
  target_id UUID,
  detail TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Idempotency backstop — one run per (message, action).
CREATE UNIQUE INDEX IF NOT EXISTS inbox_action_runs_message_action_key
  ON inbox_action_runs(message_id, action_id);
CREATE INDEX IF NOT EXISTS inbox_action_runs_user_created_idx
  ON inbox_action_runs(user_id, created_at);
CREATE INDEX IF NOT EXISTS inbox_action_runs_message_idx
  ON inbox_action_runs(message_id);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'inbox_action_runs_status_check') THEN
    ALTER TABLE inbox_action_runs
      ADD CONSTRAINT inbox_action_runs_status_check
      CHECK (status IN ('success', 'error', 'skipped')) NOT VALID;
  END IF;
END $$;
