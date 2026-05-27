-- Scale-audit covering indexes — pure additions, zero data risk.
-- See c:/code/hired/hired.video/api/drizzle/CONVENTIONS.md "Indexes"
-- for the rule each addition satisfies.
--
-- Targets the missing "(actor, time DESC)" composites that turn list-by-
-- actor / list-by-parent queries from sort-after-scan into a streaming
-- index read. Each index is the smallest one that covers the canonical
-- query for the table.

-- ---------------------------------------------------------------------------
-- feed_posts — user feed (my posts newest first) + global feed.
-- The polymorphic `idx_feed_posts_subject` index from 0142 covers
-- "all posts about subject X" but not "all posts by user X."
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_feed_posts_user_created
  ON feed_posts (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_feed_posts_global_created
  ON feed_posts (created_at DESC)
  WHERE privacy = 'Public';

-- ---------------------------------------------------------------------------
-- job_applications — two hot read patterns:
--   (a) job seeker "my applications" → (user_id, applied_at DESC)
--   (b) recruiter "applicants for this job, filter by status" →
--       (job_id, status, applied_at DESC)
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_job_applications_user_applied
  ON job_applications (user_id, applied_at DESC);

CREATE INDEX IF NOT EXISTS idx_job_applications_job_status_applied
  ON job_applications (job_id, status, applied_at DESC)
  WHERE job_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- ai_usage_records — billing reconciliation + "my AI usage this month."
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_ai_usage_records_user_created
  ON ai_usage_records (user_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- event_attendees — "my RSVPs" feed.
-- Existing idx_event_attendees_user_id covers (user_id, rsvped_at) per
-- 0142; left alone. ALL other event_attendees indexes pre-exist.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- resume_information — "my resumes, most recently edited first."
-- Existing resume_information_user_id_idx is (user_id) only. The list
-- page sorts by updated_at; without a composite that becomes a sort
-- after the index range read.
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_resume_information_user_updated
  ON resume_information (user_id, updated_at DESC)
  WHERE archived_at IS NULL;

-- ---------------------------------------------------------------------------
-- messages — conversation thread render: "this conversation's messages."
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_messages_conversation_created
  ON messages (conversation_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_messages_sender_created
  ON messages (sender_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- ai_chat_sessions — partial index on active sessions for the sidebar
-- "my active chats" query. Most sessions over time are inactive (archived
-- after a few days), so a partial covers the hot read at a fraction of
-- the index size.
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_ai_chat_sessions_user_active_updated
  ON ai_chat_sessions (user_id, updated_at DESC)
  WHERE is_active = true;

-- ---------------------------------------------------------------------------
-- notifications — "my notifications, newest first."
-- The table has no existing user index at all.
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_notifications_user_created
  ON notifications (user_id, created_at DESC);

-- Partial index for the badge / unread-count query that runs on every
-- page load — most users have 0 unread, so this stays tiny.
CREATE INDEX IF NOT EXISTS idx_notifications_user_unread
  ON notifications (user_id)
  WHERE is_read = false;

-- ---------------------------------------------------------------------------
-- saved_jobs — "my saved jobs by status" tracker page.
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_saved_jobs_user_status_created
  ON saved_jobs (user_id, status, created_at DESC);

-- ---------------------------------------------------------------------------
-- pipeline_candidates / pipeline_touchpoints — recruiter "my pipeline"
-- query. Already partially indexed by 0142 (`(stage)` + `(type)`); add
-- the per-owner ordering composite.
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables WHERE table_name = 'pipeline_candidates'
  ) AND EXISTS (
    SELECT 1 FROM information_schema.columns WHERE table_name = 'pipeline_candidates' AND column_name = 'owner_user_id'
  ) THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_pipeline_candidates_owner_created ON pipeline_candidates (owner_user_id, created_at DESC)';
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- candidate_submissions — recruiter "my submissions" + "submissions for job".
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_candidate_submissions_recruiter_submitted
  ON candidate_submissions (recruiter_id, submitted_at DESC);

CREATE INDEX IF NOT EXISTS idx_candidate_submissions_job_status_submitted
  ON candidate_submissions (job_id, status, submitted_at DESC)
  WHERE job_id IS NOT NULL;
