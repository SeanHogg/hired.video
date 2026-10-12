-- Migration 0510 — Tie AI Tool runs to the studio session they were made in.
--
-- /studio/<id> is the session a career kit is worked in. Every AI Tool run
-- made there (chat runs and slide-out tools) is recorded with the session's
-- project id, so reopening the session — any browser, any device — brings
-- the runs and their results back. A session's runs live as long as the
-- session: FK cascade removes them with it, and the 90-day retention sweep
-- (services/maintenance/retention-sweep.ts) only ages out runs with no
-- session (studio_project_id IS NULL).
--
-- Idempotent: IF NOT EXISTS. The index is declared in db/schema/tool-runs.ts
-- (CI `drizzle-kit push` drops undeclared indexes).

ALTER TABLE tool_runs
  ADD COLUMN IF NOT EXISTS studio_project_id uuid REFERENCES studio_projects(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS tool_runs_studio_project_tool_idx
  ON tool_runs (studio_project_id, tool_id, created_at);
