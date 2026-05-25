-- Migration: 0120_video_interview_depth
--
-- Brings the async-video-interview surface from "infrastructure exists" to
-- "outshine HireVue / VidCruiter". Adds:
--   1. interview_question_sets — reusable library of question sets that an
--      employer / recruiter can attach to multiple jobs or send ad-hoc.
--      Generated sets from /tools/interview-questions can be saved here.
--   2. Screening attachment on job_items — when an employer posts a job
--      they can attach a question set (required/optional/none). The apply
--      flow then auto-creates a screening interview bound to the new
--      application.
--   3. AI scoring + decision columns on studio_async_interviews and
--      studio_async_responses — per-answer STAR scoring, recruiter
--      shortlist/reject decision, aggregated proctoring summary.
--   4. Retake + prep + proctoring per response.
--   5. Link studio_async_interviews → job_applications so the recruiter
--      review surface can pivot through application → screening response.

-- 1. Reusable question-set library ------------------------------------------

CREATE TABLE IF NOT EXISTS interview_question_sets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Either user-owned (personal recruiter library) OR company-owned
  -- (shared across the company's recruiters). Exactly one is set.
  owner_user_id    uuid REFERENCES users(id)             ON DELETE CASCADE,
  owner_company_id uuid REFERENCES company_profiles(id)  ON DELETE CASCADE,

  title        varchar(200) NOT NULL,
  description  text,
  target_role  varchar(120),
  -- 'mixed' | 'behavioral' | 'technical' — matches QuestionStyle in services/interview/question-generator.ts
  style        varchar(20) NOT NULL DEFAULT 'mixed',

  -- Array<{id, text, category, maxDurationSec, required, skillLinks[]}>
  questions     jsonb NOT NULL DEFAULT '[]'::jsonb,
  -- Skill snapshot used to generate the set (for re-running on a new candidate)
  skills        jsonb NOT NULL DEFAULT '[]'::jsonb,

  -- Defaults applied when this set is sent / attached to a job. Per-question
  -- overrides may live inside `questions[].prepTimeSec` and `.maxRetakes`.
  prep_time_sec   integer NOT NULL DEFAULT 10 CHECK (prep_time_sec BETWEEN 0 AND 120),
  max_retakes     integer NOT NULL DEFAULT 1  CHECK (max_retakes BETWEEN 0 AND 10),
  proctoring_on   boolean NOT NULL DEFAULT true,

  is_archived  boolean NOT NULL DEFAULT false,
  -- Snapshot count for cheap listing — kept in sync by the route layer.
  use_count    integer NOT NULL DEFAULT 0,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT interview_question_sets_owner_xor
    CHECK ((owner_user_id IS NOT NULL) <> (owner_company_id IS NOT NULL))
);

CREATE INDEX IF NOT EXISTS idx_interview_question_sets_owner_user
  ON interview_question_sets (owner_user_id, updated_at DESC)
  WHERE owner_user_id IS NOT NULL AND is_archived = false;

CREATE INDEX IF NOT EXISTS idx_interview_question_sets_owner_company
  ON interview_question_sets (owner_company_id, updated_at DESC)
  WHERE owner_company_id IS NOT NULL AND is_archived = false;

-- 2. Job screening attachment -----------------------------------------------

ALTER TABLE job_items
  ADD COLUMN IF NOT EXISTS screening_question_set_id uuid
    REFERENCES interview_question_sets(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS screening_required varchar(16) NOT NULL DEFAULT 'none'
    CHECK (screening_required IN ('none', 'optional', 'required'));

CREATE INDEX IF NOT EXISTS idx_job_items_screening_set
  ON job_items (screening_question_set_id)
  WHERE screening_question_set_id IS NOT NULL;

-- 3. Async-interview depth: recruiter decision + AI overall + question-set provenance

ALTER TABLE studio_async_interviews
  ADD COLUMN IF NOT EXISTS question_set_id uuid
    REFERENCES interview_question_sets(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS application_id uuid
    REFERENCES job_applications(id) ON DELETE SET NULL,

  -- Recruiter decision pillar
  ADD COLUMN IF NOT EXISTS decision         varchar(16),   -- 'shortlist' | 'maybe' | 'reject'
  ADD COLUMN IF NOT EXISTS decision_reason  text,
  ADD COLUMN IF NOT EXISTS decision_by      uuid REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS decision_at      timestamptz,

  -- AI overall pillar (cached aggregate across answers)
  ADD COLUMN IF NOT EXISTS ai_overall_score   numeric(4,2),  -- 0.00 – 10.00
  ADD COLUMN IF NOT EXISTS ai_overall_summary text,
  ADD COLUMN IF NOT EXISTS ai_scored_at       timestamptz,

  -- Recorder behaviour pillar (snapshot at assignment-creation time)
  ADD COLUMN IF NOT EXISTS prep_time_sec  integer NOT NULL DEFAULT 10,
  ADD COLUMN IF NOT EXISTS max_retakes    integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS proctoring_on  boolean NOT NULL DEFAULT true;

ALTER TABLE studio_async_interviews
  DROP CONSTRAINT IF EXISTS studio_async_interviews_decision_chk,
  ADD CONSTRAINT studio_async_interviews_decision_chk
    CHECK (decision IS NULL OR decision IN ('shortlist', 'maybe', 'reject'));

CREATE INDEX IF NOT EXISTS idx_async_interviews_application
  ON studio_async_interviews (application_id)
  WHERE application_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_async_interviews_decision
  ON studio_async_interviews (recruiter_id, decision)
  WHERE decision IS NOT NULL;

-- 4. Per-response AI scoring + proctoring + retake bookkeeping

ALTER TABLE studio_async_responses
  ADD COLUMN IF NOT EXISTS ai_score           numeric(4,2),
  ADD COLUMN IF NOT EXISTS ai_score_breakdown jsonb,
  ADD COLUMN IF NOT EXISTS ai_summary         text,
  ADD COLUMN IF NOT EXISTS ai_strengths       jsonb,
  ADD COLUMN IF NOT EXISTS ai_concerns        jsonb,
  ADD COLUMN IF NOT EXISTS ai_scored_at       timestamptz,
  -- {tabBlurCount, pasteCount, copyCount, fullscreenExits, prepUsedSec,
  --  retakesUsed, micLevelAvg, deviceLabel} — populated by the recorder
  --  and the text-answer editor.
  ADD COLUMN IF NOT EXISTS proctoring_flags   jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS attempt            integer NOT NULL DEFAULT 1;
