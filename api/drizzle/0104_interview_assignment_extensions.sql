-- 0104 — Async interview assignment extensions.
--
-- Closes the gaps that blocked turning studio_async_interviews from a
-- bare "recruiter mails out videos" workflow into a real
-- assign-from-question-generator flow:
--   • token + answer deadlines (the magic link must expire, and a
--     candidate's window to answer is separate from the link's window
--     so a recruiter can re-send without resetting both clocks)
--   • resend bookkeeping (count + last resent at)
--   • source provenance — which resume, which job, which tool surface
--     triggered the assignment (career-360 / ai-coach / tool / pipeline)
--   • assignment_type to distinguish strict-assign (candidate must exist
--     as a job_seeker) from invite (claim via signup on the magic link)
--   • extractedSkills snapshot so the candidate / recruiter can see
--     what the questions were built against without re-running the
--     extractor
--
-- studio_async_responses gains a text answer + response mode so
-- candidates can choose text or video per question, matching the spec
-- that "job seeker can view their answers" (text reads better than a
-- video URL in the answer-history view).
--
-- Idempotent: every ADD COLUMN uses IF NOT EXISTS.

ALTER TABLE studio_async_interviews
  ADD COLUMN IF NOT EXISTS invite_token_expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS question_response_deadline TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS resend_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_resent_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS source_resume_id UUID,
  ADD COLUMN IF NOT EXISTS source_context TEXT,
  ADD COLUMN IF NOT EXISTS target_role TEXT,
  ADD COLUMN IF NOT EXISTS extracted_skills JSONB,
  ADD COLUMN IF NOT EXISTS assignment_type TEXT NOT NULL DEFAULT 'assign';

CREATE INDEX IF NOT EXISTS idx_async_interviews_token_active
  ON studio_async_interviews(invite_token)
  WHERE invite_token IS NOT NULL;

ALTER TABLE studio_async_responses
  ADD COLUMN IF NOT EXISTS text_answer TEXT,
  ADD COLUMN IF NOT EXISTS response_mode TEXT NOT NULL DEFAULT 'video';
