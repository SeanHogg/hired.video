-- Migration 0119 — Create missing `recruiter_agent_runs` table + re-run 0117.
--
-- Root cause: `api/src/db/schema/recruiter.ts` declares
-- `recruiter_agent_runs` (AI Recruiter Agent v1 — sourcing runs feeding
-- the v2 follow-up loop) but no migration in `api/drizzle/` ever runs
-- `CREATE TABLE` for it. Production happens to have it from a legacy
-- push, so the schema-parity allowlist
-- [`migration-schema-parity.test.mjs:172`](../scripts/migration-schema-parity.test.mjs)
-- silently waived it. Then 0117 added a `REFERENCES recruiter_agent_runs(id)`
-- FK on `recruiter_agent_followups` — every fresh-DB deploy (and the
-- current CI build) crashes at 0117 because the FK target doesn't exist.
--
-- Fix shape (mirrors the 0114 affiliate-tables pattern):
--   1. CREATE TABLE IF NOT EXISTS recruiter_agent_runs — columns mirror
--      `api/src/db/schema/recruiter.ts` `recruiterAgentRuns` exactly.
--      Idempotent on the production DB that already has the table.
--   2. Re-run the 0117 statements verbatim. Each is IF NOT EXISTS so
--      partial-state environments (production had 0117 succeed because
--      the FK target existed there) become no-ops; fresh CI DBs that
--      failed 0117 now land in the post-0117 shape.
--
-- Idempotent on every re-run. No data is touched.

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

-- ─── Re-run 0117 statements (verbatim) ───────────────────────────────────────
-- 0117 failed at CREATE TABLE because the FK target above didn't exist.
-- IF NOT EXISTS makes these no-ops on the production DB (where 0117
-- succeeded) and replays them on every fresh DB.

CREATE TABLE IF NOT EXISTS recruiter_agent_followups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  run_id        uuid NOT NULL REFERENCES recruiter_agent_runs(id) ON DELETE CASCADE,
  recruiter_id  uuid NOT NULL REFERENCES users(id)                 ON DELETE CASCADE,
  candidate_id  uuid NOT NULL REFERENCES users(id)                 ON DELETE CASCADE,

  followup_kind   varchar(32) NOT NULL,
  sequence_index  integer NOT NULL DEFAULT 1,

  scheduled_for  timestamptz NOT NULL,
  sent_at        timestamptz,

  body  text NOT NULL,
  status varchar(20) NOT NULL DEFAULT 'pending',

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_recruiter_agent_followups_due
  ON recruiter_agent_followups (scheduled_for)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_recruiter_agent_followups_recruiter
  ON recruiter_agent_followups (recruiter_id, scheduled_for DESC);

CREATE INDEX IF NOT EXISTS idx_recruiter_agent_followups_run
  ON recruiter_agent_followups (run_id, sequence_index);
