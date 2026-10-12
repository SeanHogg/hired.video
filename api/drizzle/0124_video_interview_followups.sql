-- Migration: 0124_video_interview_followups
--
-- Closes gap-register entries #1234–#1239 against the video-interview
-- depth work in #1233 / migration 0120.
--
-- 1. users.video_pitch_url + users.video_pitch_set_at — durable storage for
--    the candidate's master 60-second pitch produced by the Video Pitch Lab
--    tool. Replaces the previous "copy URL by hand" flow; the URL now lives
--    on the user row so the public profile, application autofill, and
--    recruiter inbox can all surface the same asset.
--
-- 2. studio_async_responses.transcription_status — bookkeeping for the
--    async transcription job triggered by POST /api/interview-assignments/
--    :id/respond when responseMode = 'video'. Values:
--      'pending'    — job queued; transcription not yet written.
--      'completed'  — `transcription` column populated.
--      'failed'     — transcription job failed (recruiter can re-trigger).
--    NULL on legacy rows + text-mode rows; only video rows ever transition.
--
-- 3. studio_async_responses.transcription_job_id — provider job id so the
--    pipeline can poll / re-fetch a transcription that came back async.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS video_pitch_url text,
  ADD COLUMN IF NOT EXISTS video_pitch_set_at timestamptz;

ALTER TABLE studio_async_responses
  ADD COLUMN IF NOT EXISTS transcription_status varchar(20),
  ADD COLUMN IF NOT EXISTS transcription_job_id text;
