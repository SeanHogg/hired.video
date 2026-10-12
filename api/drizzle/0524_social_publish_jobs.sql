-- Migration 0524 — social_publish_jobs: the scheduled-post queue (#2047).
--
-- One row = one post of one Studio project to one destination at a set
-- time. The 5-minute cron (api/src/scheduled.ts → processSocialPublishJobs)
-- claims at most 3 due jobs per run (UPDATE … WHERE id IN (SELECT … FOR
-- UPDATE SKIP LOCKED LIMIT 3)), runs each through the existing publish
-- paths — Lane B: publishProjectVideo (runSelfPublishGate); Lane A: the
-- promotion queue submit; feed: a feed_posts row — and records the outcome.
--
--   destination  a network id or 'feed' (shared/social-publish-jobs.ts)
--   lane         'self' (the user's own account) | 'managed' (hired.video's
--                brand account, via the promotion review queue)
--   status       scheduled → running → done | failed; scheduled → cancelled
--   scheduled_at the send time the user picked (never rewritten)
--   run_at       when the next attempt may run (= scheduled_at, then
--                pushed back by the retry backoff)
--   started_at   the first claim — a re-claimed job checks for a
--                publication made since then before posting again
--
-- 3NF: the job references the project, its creator, the fitted cut it
-- should post (render_variant_id; null = the master, and a cut that went
-- stale or was reclaimed falls back to the master at send time) and the
-- record it produced (publication / promotion submission / feed post). It
-- copies no title or file metadata; `caption` is the text the user typed
-- for this post and `post_settings` the per-network choices they made
-- (TikTok privacy & interactions, YouTube privacy).
--
-- Additive only: one new table + indexes. No data is changed or deleted.
-- Idempotent: IF NOT EXISTS throughout. Every index and CHECK is declared
-- in db/schema/distribution.ts with the same name.

CREATE TABLE IF NOT EXISTS social_publish_jobs (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id               uuid NOT NULL REFERENCES studio_projects(id) ON DELETE CASCADE,
  created_by               uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  destination              varchar(16) NOT NULL,
  lane                     varchar(8) NOT NULL,
  render_variant_id        uuid REFERENCES studio_project_render_variants(id) ON DELETE SET NULL,
  caption                  text NOT NULL DEFAULT '',
  post_settings            jsonb,
  scheduled_at             timestamptz NOT NULL,
  run_at                   timestamptz NOT NULL,
  status                   varchar(16) NOT NULL DEFAULT 'scheduled',
  attempts                 integer NOT NULL DEFAULT 0,
  last_error               text,
  locked_at                timestamptz,
  started_at               timestamptz,
  completed_at             timestamptz,
  publication_id           uuid REFERENCES studio_project_publications(id) ON DELETE SET NULL,
  promotion_submission_id  uuid REFERENCES promotion_submissions(id) ON DELETE SET NULL,
  feed_post_id             uuid REFERENCES feed_posts(id) ON DELETE SET NULL,
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT social_publish_jobs_destination_check
    CHECK (destination IN ('youtube', 'tiktok', 'instagram', 'x', 'facebook', 'linkedin', 'feed')),
  CONSTRAINT social_publish_jobs_lane_check
    CHECK (lane IN ('self', 'managed')),
  CONSTRAINT social_publish_jobs_status_check
    CHECK (status IN ('scheduled', 'running', 'done', 'failed', 'cancelled'))
);

-- The drainer's claim: due scheduled jobs (and stale running ones) by run_at.
CREATE INDEX IF NOT EXISTS idx_social_publish_jobs_status_run_at
  ON social_publish_jobs (status, run_at);

-- The Hub's lists: one creator's jobs, newest send time first.
CREATE INDEX IF NOT EXISTS idx_social_publish_jobs_creator_scheduled
  ON social_publish_jobs (created_by, scheduled_at DESC);

CREATE INDEX IF NOT EXISTS idx_social_publish_jobs_project
  ON social_publish_jobs (project_id);

-- ON DELETE SET NULL targets.
CREATE INDEX IF NOT EXISTS idx_social_publish_jobs_variant
  ON social_publish_jobs (render_variant_id);
CREATE INDEX IF NOT EXISTS idx_social_publish_jobs_publication
  ON social_publish_jobs (publication_id);
CREATE INDEX IF NOT EXISTS idx_social_publish_jobs_promotion
  ON social_publish_jobs (promotion_submission_id);
CREATE INDEX IF NOT EXISTS idx_social_publish_jobs_feed_post
  ON social_publish_jobs (feed_post_id);

-- One open job per project, destination and lane: scheduling the same post
-- twice is refused instead of posting it twice.
CREATE UNIQUE INDEX IF NOT EXISTS uq_social_publish_jobs_open
  ON social_publish_jobs (project_id, destination, lane)
  WHERE status IN ('scheduled', 'running');
