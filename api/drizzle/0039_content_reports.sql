-- Migration: Content abuse reports (#152) — closes the user-facing gap for
-- reporting spam, impersonation, or inappropriate content on UGC surfaces.
-- Required for §230 / DSA compliance once UGC volume scales.

CREATE TABLE IF NOT EXISTS content_reports (
  id           UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id  UUID         NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  -- Polymorphic target. entity_type matches the polymorphic-subject convention
  -- already used by reviews (subject_type) and feed posts (subject_type).
  entity_type  VARCHAR(64)  NOT NULL,    -- resume | job | article | service | voice_clone | feed_post | user_profile
  entity_id    UUID         NOT NULL,
  -- spam | impersonation | inappropriate | harassment | copyright | other
  reason       VARCHAR(32)  NOT NULL,
  notes        TEXT,
  -- pending | reviewing | resolved_action_taken | resolved_no_action | dismissed
  status       VARCHAR(32)  NOT NULL DEFAULT 'pending',
  resolved_by  UUID REFERENCES users(id) ON DELETE SET NULL,
  resolved_at  TIMESTAMPTZ,
  resolution   TEXT,
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_content_reports_target
  ON content_reports (entity_type, entity_id);

CREATE INDEX IF NOT EXISTS idx_content_reports_status
  ON content_reports (status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_content_reports_reporter
  ON content_reports (reporter_id, created_at DESC);

-- One pending report per (reporter, entity) so we don't accumulate dupe spam
-- from a single user pestering the same target.
CREATE UNIQUE INDEX IF NOT EXISTS uq_content_reports_active
  ON content_reports (reporter_id, entity_type, entity_id)
  WHERE status IN ('pending', 'reviewing');
