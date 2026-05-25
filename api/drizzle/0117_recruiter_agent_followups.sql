-- Migration: 0117_recruiter_agent_followups
--
-- Persisted follow-up reminders for the AI Recruiter Agent (#66) — the
-- v2 surface that closes the LinkedIn Hiring Assistant parity gap. Each
-- row is one scheduled (or sent) follow-up tied back to the originating
-- agent run + candidate so the v2 worker can fire it when the time
-- arrives without re-sourcing or re-scoring.
--
-- Status lifecycle:
--   pending   → scheduled, not yet due (or due but not yet picked up)
--   sent      → worker dispatched the message
--   cancelled → recruiter manually called off the sequence
--
-- The worker (`recruiter-agent-followup`) selects rows where
-- status = 'pending' AND scheduled_for <= now() and flips them to
-- sent / cancelled. There's no auto-send to candidates yet — the worker
-- materialises the draft into candidate_interactions for the recruiter
-- to send through their channel of choice. Auto-send routes through the
-- messaging service when wired in a later pass.
--
-- ─── Self-sufficient FK target (gap #1204) ──────────────────────────────────
-- `recruiter_agent_runs` is declared in [api/src/db/schema/recruiter.ts]
-- but historically had no CREATE TABLE migration — production had it from
-- an out-of-tree `drizzle-kit push` and the parity test silently waived
-- it (see [scripts/migration-schema-parity.test.mjs] KNOWN_MISSING_CREATE_TABLE).
-- The runner ([scripts/run-sql-migrations.mjs]) is stateless and re-runs
-- every 0*.sql in order on every deploy, so a later "create missing tables"
-- migration cannot save this file from failing on a fresh CI database.
-- Create the FK target here (IF NOT EXISTS makes it a no-op on production)
-- so 0117 is self-sufficient against any DB shape. Mirrors the columns of
-- `recruiterAgentRuns` exactly.

CREATE TABLE IF NOT EXISTS recruiter_agent_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recruiter_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  job_id uuid,
  job_title varchar(255),
  criteria jsonb DEFAULT '{}'::jsonb,
  status varchar(50) NOT NULL DEFAULT 'pending',
  candidates_found integer NOT NULL DEFAULT 0,
  candidates_scored integer NOT NULL DEFAULT 0,
  results jsonb DEFAULT '[]'::jsonb,
  error_message text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS recruiter_agent_followups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  run_id        uuid NOT NULL REFERENCES recruiter_agent_runs(id) ON DELETE CASCADE,
  recruiter_id  uuid NOT NULL REFERENCES users(id)                 ON DELETE CASCADE,
  candidate_id  uuid NOT NULL REFERENCES users(id)                 ON DELETE CASCADE,

  -- Stable ordinal so a recruiter can see "follow-up 2 of 3" in the
  -- UI without computing it. The agent schedules in fixed steps
  -- (1st = 3d, 2nd = 7d, final = 14d by default) but the recruiter
  -- can reschedule individual rows.
  followup_kind   varchar(32) NOT NULL,
  sequence_index  integer NOT NULL DEFAULT 1,

  scheduled_for  timestamptz NOT NULL,
  sent_at        timestamptz,

  body  text NOT NULL,
  status varchar(20) NOT NULL DEFAULT 'pending',

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Worker pickup query: due, pending, oldest first.
CREATE INDEX IF NOT EXISTS idx_recruiter_agent_followups_due
  ON recruiter_agent_followups (scheduled_for)
  WHERE status = 'pending';

-- Recruiter-facing "my follow-ups" list (status + chronological).
CREATE INDEX IF NOT EXISTS idx_recruiter_agent_followups_recruiter
  ON recruiter_agent_followups (recruiter_id, scheduled_for DESC);

-- Per-run lookup so the agent UI can show the schedule attached to a run.
CREATE INDEX IF NOT EXISTS idx_recruiter_agent_followups_run
  ON recruiter_agent_followups (run_id, sequence_index);
