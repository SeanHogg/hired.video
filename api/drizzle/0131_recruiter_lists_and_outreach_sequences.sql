-- Migration 0131 — Recruiter Lists + Outreach Sequences (gaps #1360 + #1357)
--
-- Two related aggregates landing together because they share the same
-- root-cause motion: the recruiter extension needs first-class
-- collections of candidates (lists) and reusable outreach copy
-- (sequences) to reach Loxo-Boost parity.
--
-- All CREATE statements are IF NOT EXISTS so re-running this migration
-- on an environment that partially applied earlier work is safe; the
-- runner records the file in `_sql_migrations` after a clean apply.

-- ─── Recruiter Lists (gap #1360) ────────────────────────────────────────
-- Recruiter-scoped buckets of candidates distinct from a job's pipeline.
-- A list can be a saved Boolean-search result, a prioritised call queue,
-- or a long-running pool ("Senior Frontend — open to remote"). Members
-- are talent_pool_candidates; one candidate can appear in many lists.

CREATE TABLE IF NOT EXISTS recruiter_lists (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recruiter_id  uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name          varchar(255) NOT NULL,
  description   text,
  kind          varchar(32) DEFAULT 'list' NOT NULL,  -- 'list' | 'call_queue'
  created_at    timestamptz DEFAULT now() NOT NULL,
  updated_at    timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS recruiter_lists_recruiter_idx
  ON recruiter_lists (recruiter_id);

CREATE TABLE IF NOT EXISTS recruiter_list_members (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  list_id                  uuid NOT NULL REFERENCES recruiter_lists(id) ON DELETE CASCADE,
  talent_pool_candidate_id uuid NOT NULL REFERENCES talent_pool_candidates(id) ON DELETE CASCADE,
  position                 integer DEFAULT 0 NOT NULL,
  added_at                 timestamptz DEFAULT now() NOT NULL,
  UNIQUE (list_id, talent_pool_candidate_id)
);

CREATE INDEX IF NOT EXISTS recruiter_list_members_list_idx
  ON recruiter_list_members (list_id);
CREATE INDEX IF NOT EXISTS recruiter_list_members_candidate_idx
  ON recruiter_list_members (talent_pool_candidate_id);

-- ─── Recruiter Outreach Sequences (gap #1357) ───────────────────────────
-- Templates: ordered steps with channel + delay + body. Distinct from
-- `recruiter_agent_followups` (which is run-bound, single-message-per-row,
-- agent-orchestrated) — sequences are recruiter-authored copy that can be
-- enrolled from the Chrome extension without first running the sourcing
-- agent.

CREATE TABLE IF NOT EXISTS recruiter_outreach_sequences (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recruiter_id  uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name          varchar(255) NOT NULL,
  description   text,
  steps         jsonb DEFAULT '[]' NOT NULL,  -- [{ channel, delayDays, subject, body }]
  is_active     boolean DEFAULT true NOT NULL,
  created_at    timestamptz DEFAULT now() NOT NULL,
  updated_at    timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS recruiter_outreach_sequences_recruiter_idx
  ON recruiter_outreach_sequences (recruiter_id);

CREATE TABLE IF NOT EXISTS recruiter_outreach_enrollments (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sequence_id              uuid NOT NULL REFERENCES recruiter_outreach_sequences(id) ON DELETE CASCADE,
  recruiter_id             uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  talent_pool_candidate_id uuid NOT NULL REFERENCES talent_pool_candidates(id) ON DELETE CASCADE,
  status                   varchar(20) DEFAULT 'active' NOT NULL,  -- 'active' | 'paused' | 'completed' | 'cancelled'
  current_step             integer DEFAULT 0 NOT NULL,
  next_send_at             timestamptz,
  enrolled_at              timestamptz DEFAULT now() NOT NULL,
  completed_at             timestamptz,
  metadata                 jsonb DEFAULT '{}' NOT NULL,
  UNIQUE (sequence_id, talent_pool_candidate_id)
);

CREATE INDEX IF NOT EXISTS recruiter_outreach_enrollments_recruiter_idx
  ON recruiter_outreach_enrollments (recruiter_id);
CREATE INDEX IF NOT EXISTS recruiter_outreach_enrollments_due_idx
  ON recruiter_outreach_enrollments (status, next_send_at)
  WHERE status = 'active';
