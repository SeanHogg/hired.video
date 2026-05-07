-- 0079 — profile_sync_runs (Vendor Sync audit log)
--
-- Captures every read/write between the user's master resume on hired.video
-- and an external profile vendor (LinkedIn, Indeed, Glassdoor, GitHub, ...).
--
-- The hired.video data model splits one master resume into many job-targeted
-- variants — vendor profiles don't make that distinction. So:
--
--   direction = 'import' → vendor profile pulled INTO hired.video and merged
--                          into the user's master. `target_resume_id` points
--                          at the master that received the merge. The
--                          analysis/decisions snapshots replay what the user
--                          chose during MergeResumeDialog.
--
--   direction = 'export' → a hired.video resume was pushed OUT to the vendor
--                          (manual copy/paste, PDF download, or future
--                          extension auto-fill). `source_resume_id` records
--                          which variant was rendered, so the (deferred)
--                          variant-effectiveness analytics can attribute
--                          interview/offer outcomes to the variant the user
--                          actually shared on each platform.
--
-- Status lifecycle:
--   pending  → row written when a flow starts; updated on completion.
--              Mostly used so the side panel can resume an interrupted run.
--   success  → run finished and analysis/decisions are durable.
--   failed   → connector or LLM blew up; `error_message` carries the cause.
--   cancelled→ user closed the dialog before executing.
--
-- The runs table is intentionally tolerant of provider churn: `connector_id`
-- is plain text rather than an FK to a provider table, since the registry
-- lives in code. Removing a connector should never orphan history.

CREATE TABLE IF NOT EXISTS profile_sync_runs (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  connector_id        varchar(64) NOT NULL,
  direction           varchar(16) NOT NULL,
  status              varchar(16) NOT NULL DEFAULT 'pending',

  -- One side is always populated; the other is null based on direction.
  -- Soft FK (set null on resume delete) — losing a resume should leave
  -- the audit row intact for outcome attribution.
  target_resume_id    uuid REFERENCES resume_information(id) ON DELETE SET NULL,
  source_resume_id    uuid REFERENCES resume_information(id) ON DELETE SET NULL,

  source_url          text,                 -- vendor page the run was scoped to
  analysis_snapshot   jsonb,                -- the MergeAnalysis returned to the UI
  decisions_snapshot  jsonb,                -- the MergeDecision[] the user picked
  result_snapshot     jsonb,                -- merge counts + new resume id (import)
                                            -- or rendered block summary (export)
  notes               text,                 -- user's own annotation on a manual run
  error_message       text,

  started_at          timestamptz NOT NULL DEFAULT now(),
  completed_at        timestamptz,
  manual_marked_at    timestamptz           -- set when the user self-reports a manual sync
);

-- Read patterns:
--   • per-user history surface on the tool page (recent first)
--   • "when did I last sync to LinkedIn?" lookup keyed on (user, connector)
--   • outcome attribution: find every export of a given variant
CREATE INDEX IF NOT EXISTS profile_sync_runs_user_started_idx
  ON profile_sync_runs (user_id, started_at DESC);

CREATE INDEX IF NOT EXISTS profile_sync_runs_user_connector_idx
  ON profile_sync_runs (user_id, connector_id, started_at DESC);

CREATE INDEX IF NOT EXISTS profile_sync_runs_source_resume_idx
  ON profile_sync_runs (source_resume_id)
  WHERE source_resume_id IS NOT NULL;
