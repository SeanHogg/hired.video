-- Migration 0525 — external_post_metrics: off-platform reach snapshots (#2048).
--
-- One row per (publication, UTC day): the counts a network reported for a
-- post that hired.video published to it (studio_project_publications). Fed
-- by the half-hourly cron sync (a bounded batch of publications with no
-- snapshot for today) and by inbound platform webhooks
-- (/api/social/webhooks/:platform), which refresh today's row. Re-syncing a
-- day UPSERTs that day's row, so the table is a daily history, not an
-- append log.
--
-- Counts are nullable: a network that doesn't report likes or shares for
-- this kind of post leaves them null (unknown), never zero.
--
-- 3NF: the post, its project and its destination live on the publication
-- row; this table carries only the measured counts and when they were read.
--
-- Additive only: one new table + indexes. No data is changed or deleted.
-- Idempotent: IF NOT EXISTS throughout. Every index is declared in
-- db/schema/distribution.ts with the same name.

CREATE TABLE IF NOT EXISTS external_post_metrics (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  publication_id  uuid NOT NULL REFERENCES studio_project_publications(id) ON DELETE CASCADE,
  metric_date     date NOT NULL,
  views           bigint,
  likes           bigint,
  shares          bigint,
  comments        bigint,
  fetched_at      timestamptz NOT NULL DEFAULT now(),
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- One snapshot per publication per day (the sync's upsert target; also
-- answers "has this publication been read today").
CREATE UNIQUE INDEX IF NOT EXISTS uq_external_post_metrics_pub_date
  ON external_post_metrics (publication_id, metric_date);
