-- #1594 — Data-model audit, batch 4: remaining composite indexes (#1599).
--
-- Pure additions, zero data risk. Same pattern as 0142 — every
-- CREATE INDEX uses IF NOT EXISTS so the migration is idempotent and
-- the runner's _sql_migrations gate is the source of truth.
--
-- Verified pre-existing indexes against schema/ before adding:
--   - external_email_messages already has
--     `external_email_messages_user_inbox_idx (user_id, is_archived,
--      received_at)` which is strictly more useful than the
--     `(user_id, created_at DESC)` audit had asked for. Skipped.
--   - artifact_views has owner-only + viewed_at-only indexes but no
--     composite — adding the composite is the gap.
--   - tasks has no indexes at all today; both "my tasks" and the
--     board kanban view sit on full table scans.
--
-- Closes the remaining concrete tables from #1599; #1599 stays open
-- until the open items below (encryption #1604, SCORM #1606, etc.)
-- get a separate pass.

-- ---------------------------------------------------------------------------
-- company_views — "company dashboard's recent views" feed query
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_company_views_company_viewed
  ON company_views (company_id, viewed_at DESC);

-- ---------------------------------------------------------------------------
-- artifact_views — creator-stats surface's per-creator timeline. The
-- existing single-column indexes cover lookups but force a sort on read.
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_artifact_views_owner_viewed
  ON artifact_views (owner_user_id, viewed_at DESC)
  WHERE owner_user_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- scorecard_submission_ratings — "all ratings for attribute X" analytics
-- rollup (used by calibration dashboards). The existing unique covers
-- (submission, attribute) but not the cross-submission per-attribute view.
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_scorecard_submission_ratings_attribute
  ON scorecard_submission_ratings (attribute_id);

-- ---------------------------------------------------------------------------
-- tasks — productivity board. Two distinct hot queries:
--   (a) "my tasks across all boards"  → (user_id, status, due_date)
--   (b) "this board's kanban columns" → (board_id, status, position)
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_tasks_user_status
  ON tasks (user_id, status, due_date);

CREATE INDEX IF NOT EXISTS idx_tasks_board_status_position
  ON tasks (board_id, status, position);
