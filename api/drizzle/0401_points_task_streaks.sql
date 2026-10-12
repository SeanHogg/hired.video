-- #1136 — task-completion streak (parallel to points_streaks).
--
-- The general points_streaks counter advances on ANY engagement signal
-- (applications, saved searches, AI tools, feed posts, …). Product spec ties
-- the "On Fire" badge (+ the 14/30/60/90 rungs) to a TASK-completion streak
-- specifically, so this table tracks a second streak that advances only on
-- task.complete.system / task.complete.user. The engine routes the streak
-- milestone BADGES off this counter; the general streak keeps paying the
-- engagement streak-bonus points. Same shape as points_streaks.

CREATE TABLE IF NOT EXISTS "points_task_streaks" (
  "user_id"              uuid PRIMARY KEY REFERENCES "users"("id") ON DELETE CASCADE,
  "current_streak"       integer NOT NULL DEFAULT 0,
  "longest_streak"       integer NOT NULL DEFAULT 0,
  "last_activity_date"   date,
  "last_bonus_at"        timestamptz,
  "last_bonus_milestone" integer NOT NULL DEFAULT 0,
  "updated_at"           timestamptz NOT NULL DEFAULT now()
);

-- Mirrors the nightly streak-reset sweep index on points_streaks.
CREATE INDEX IF NOT EXISTS "idx_points_task_streaks_last_activity"
  ON "points_task_streaks" ("last_activity_date")
  WHERE "last_activity_date" IS NOT NULL;
