-- 0080 — generic worker_runs table + per-job cleanse markers
--
-- Introduces the generic batch-worker framework. Each "worker" is a code-
-- registered job (see api/src/workers/registry.ts) that scans rows in
-- some table and processes them. `worker_runs` holds one row per execution
-- and is the SSoT for SuperAdmin observability + cadence gating
-- ("when did worker X last run?").
--
-- Distinct from `queue_job_to_process` (per-item task queue, drained via
-- scheduled.ts) — `worker_runs` is per-sweep, not per-item.
--
-- The first consumer is the job-body-cleanse worker, which converts
-- HTML in `job_items.description` to markdown. The two new columns on
-- job_items are the per-row cursor: `body_cleansed_at` is null until
-- inspected, then set on every run; `body_cleanse_status` records what
-- happened (cleansed | unchanged | failed). The worker re-inspects rows
-- where `updated_at > body_cleansed_at` to catch late edits.

CREATE TABLE IF NOT EXISTS worker_runs (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  worker_name     varchar(64) NOT NULL,

  -- running | success | partial | error
  -- partial = some items in the batch failed but the run finished
  status          varchar(16) NOT NULL DEFAULT 'running',

  -- manual = SuperAdmin clicked "run now"; cron = scheduled tick
  trigger         varchar(16) NOT NULL DEFAULT 'cron',
  triggered_by    uuid REFERENCES users(id) ON DELETE SET NULL,

  items_scanned   integer NOT NULL DEFAULT 0,
  items_changed   integer NOT NULL DEFAULT 0,
  items_skipped   integer NOT NULL DEFAULT 0,
  items_failed    integer NOT NULL DEFAULT 0,

  error_message   text,
  -- Bounded jsonb: per-item failure rows + a few sample diffs. The
  -- worker is responsible for capping size (see runner.ts).
  details         jsonb NOT NULL DEFAULT '{}'::jsonb,

  started_at      timestamptz NOT NULL DEFAULT now(),
  completed_at    timestamptz
);

-- Read patterns:
--   • admin dashboard: latest run per worker → (worker_name, started_at desc)
--   • admin run history page → same index, filtered to one worker
--   • cadence gate in scheduled.ts: "max(started_at) where worker_name=?"
CREATE INDEX IF NOT EXISTS worker_runs_worker_started_idx
  ON worker_runs (worker_name, started_at DESC);

-- For the manual-trigger lookup: "show me runs I kicked off"
CREATE INDEX IF NOT EXISTS worker_runs_triggered_by_idx
  ON worker_runs (triggered_by, started_at DESC)
  WHERE triggered_by IS NOT NULL;

-- ---------------------------------------------------------------------------
-- job_items cleanse cursor
-- ---------------------------------------------------------------------------
ALTER TABLE job_items
  ADD COLUMN IF NOT EXISTS body_cleansed_at    timestamptz,
  ADD COLUMN IF NOT EXISTS body_cleanse_status varchar(16);

-- Worker selects pending rows: never inspected OR inspected before last edit.
-- Partial index keeps it tight: skip rows that are already cleansed and
-- haven't been touched since. Postgres can use it directly for the LIMIT 50
-- batch query without scanning the bulk of already-clean rows.
CREATE INDEX IF NOT EXISTS job_items_cleanse_pending_idx
  ON job_items (body_cleansed_at NULLS FIRST, updated_at)
  WHERE body_cleansed_at IS NULL OR body_cleansed_at < updated_at;
