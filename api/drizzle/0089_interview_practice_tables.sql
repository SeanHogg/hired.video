-- 0089 — interview_sessions + interview_answers (AI Interview Practice).
--
-- These tables back routes/interview.ts (15 references across generate,
-- record-answer, score, share, etc.) and the AI side-panel Interview Coach
-- tool surfaced from the Tools page. They were declared in the drizzle
-- schema (db/schema/interviews.ts) but never had a migration written, so
-- every call to /api/interview/* and every read of `interview_answers.r2_key`
-- (e.g. the SuperAdmin R2 orphan sweep) 500'd with a "table does not exist"
-- error. Surfaced 2026-05-17 via /admin/storage; closes the silent break
-- of the entire interview-practice feature.
--
-- Idempotent per the 0086+/0088 pattern: every CREATE uses `IF NOT EXISTS`.

CREATE TABLE IF NOT EXISTS interview_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  job_description TEXT NOT NULL,
  interview_type VARCHAR(50) DEFAULT 'behavioral',
  questions JSONB NOT NULL,
  status VARCHAR(50) DEFAULT 'active',
  overall_score TEXT,
  share_token TEXT UNIQUE,
  is_shared BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_interview_sessions_user ON interview_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_interview_sessions_share_token ON interview_sessions(share_token);

CREATE TABLE IF NOT EXISTS interview_answers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES interview_sessions(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  question_id VARCHAR(50) NOT NULL,
  question TEXT NOT NULL,
  video_url TEXT,
  r2_key TEXT,
  transcript TEXT,
  score TEXT,
  feedback JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_interview_answers_session ON interview_answers(session_id);
CREATE INDEX IF NOT EXISTS idx_interview_answers_user ON interview_answers(user_id);
