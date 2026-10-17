-- 0636_merge_recruiter_outreach_into_follow_ups.sql
--
-- W3-D2 (architecture remediation 2026-10-17): ONE sequence engine.
--
-- `follow_up_*` (sequences + steps + enrollments + logs) becomes the only
-- sequence engine. `recruiter_outreach_sequences` (steps as a JSONB array)
-- and `recruiter_outreach_enrollments` (talent-pool candidate recipients)
-- are backfilled into it here and archived by 0637.
--
-- Generalisation of follow_up_*:
--   * follow_up_sequences.kind            nurture | recruiter_outreach
--                                         (shared/follow-up-sequences.ts)
--   * follow_up_steps.subject             nullable (outreach subjects are optional)
--   * follow_up_enrollments.talent_pool_candidate_id
--                                         candidate recipient (email/name/company
--                                         read from the candidate at send time)
--   * follow_up_enrollments.recipient_email nullable; CHECK needs email OR candidate
--   * uq (sequence_id, talent_pool_candidate_id) — the old outreach UNIQUE
--   * due index (status, next_send_at) WHERE status = 'active'
--
-- Mapping (old ids are kept so URLs/extension caches stay valid):
--   recruiter_outreach_sequences.recruiter_id  -> follow_up_sequences.user_id
--   recruiter_outreach_sequences.steps[i]      -> follow_up_steps (step_order = i+1)
--   recruiter_outreach_enrollments.recruiter_id -> follow_up_enrollments.user_id
--   recruiter_outreach_enrollments.metadata    -> follow_up_enrollments.context
--   recruiter_outreach_enrollments.enrolled_at -> follow_up_enrollments.created_at
-- current_step keeps its meaning: the engine sends step_order = current_step + 1.
--
-- Idempotent: columns/indexes IF NOT EXISTS, constraints gated on pg_constraint,
-- rows copied with ON CONFLICT DO NOTHING (carried-over ids), steps only for
-- sequences that have none yet.

-- ── Schema generalisation ──────────────────────────────────────────────────

ALTER TABLE follow_up_sequences ADD COLUMN IF NOT EXISTS kind varchar(24) DEFAULT 'nurture' NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'follow_up_sequences_kind_check') THEN
    ALTER TABLE follow_up_sequences
      ADD CONSTRAINT follow_up_sequences_kind_check
      CHECK (kind IN ('nurture', 'recruiter_outreach')) NOT VALID;
  END IF;
END $$;

ALTER TABLE follow_up_steps ALTER COLUMN subject DROP NOT NULL;

ALTER TABLE follow_up_enrollments ADD COLUMN IF NOT EXISTS talent_pool_candidate_id uuid;
ALTER TABLE follow_up_enrollments ALTER COLUMN recipient_email DROP NOT NULL;

-- FK may already exist under drizzle-kit push's name; gate on the relation,
-- not the constraint name.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE contype = 'f'
      AND conrelid = 'public.follow_up_enrollments'::regclass
      AND confrelid = 'public.talent_pool_candidates'::regclass
  ) THEN
    ALTER TABLE follow_up_enrollments
      ADD CONSTRAINT follow_up_enrollments_talent_pool_candidate_id_fkey
      FOREIGN KEY (talent_pool_candidate_id) REFERENCES talent_pool_candidates(id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'follow_up_enrollments_recipient_check') THEN
    ALTER TABLE follow_up_enrollments
      ADD CONSTRAINT follow_up_enrollments_recipient_check
      CHECK (recipient_email IS NOT NULL OR talent_pool_candidate_id IS NOT NULL) NOT VALID;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_follow_up_enrollments_talent_pool_candidate_id
  ON follow_up_enrollments (talent_pool_candidate_id);
CREATE INDEX IF NOT EXISTS idx_follow_up_enrollments_due
  ON follow_up_enrollments (status, next_send_at)
  WHERE status = 'active';
-- New column: every pre-existing row is NULL (NULLS DISTINCT), so no dedupe needed.
CREATE UNIQUE INDEX IF NOT EXISTS uq_follow_up_enrollments_sequence_candidate
  ON follow_up_enrollments (sequence_id, talent_pool_candidate_id);
-- The unique index leads with sequence_id, so the plain FK index is redundant.
DROP INDEX IF EXISTS idx_follow_up_enrollments_sequence_id;

-- ── Backfill recruiter outreach ────────────────────────────────────────────

DO $$
BEGIN
  IF to_regclass('public.recruiter_outreach_sequences') IS NULL THEN
    RETURN;
  END IF;

  INSERT INTO follow_up_sequences (id, user_id, kind, name, description, is_active, created_at, updated_at)
  SELECT s.id, s.recruiter_id, 'recruiter_outreach', s.name, s.description, s.is_active, s.created_at, s.updated_at
  FROM recruiter_outreach_sequences s
  ON CONFLICT DO NOTHING;

  INSERT INTO follow_up_steps (sequence_id, step_order, delay_days, subject, body_template, channel, ai_personalize, created_at)
  SELECT
    s.id,
    e.ord::int,
    COALESCE(round((e.step ->> 'delayDays')::numeric)::int, 0),
    left(NULLIF(e.step ->> 'subject', ''), 500),
    COALESCE(e.step ->> 'body', ''),
    COALESCE(NULLIF(e.step ->> 'channel', ''), 'email'),
    COALESCE((e.step ->> 'aiPersonalize')::boolean, false),
    s.created_at
  FROM recruiter_outreach_sequences s
  CROSS JOIN LATERAL jsonb_array_elements(
    CASE WHEN jsonb_typeof(s.steps) = 'array' THEN s.steps ELSE '[]'::jsonb END
  ) WITH ORDINALITY AS e(step, ord)
  WHERE EXISTS (
      SELECT 1 FROM follow_up_sequences f
      WHERE f.id = s.id AND f.kind = 'recruiter_outreach'
    )
    AND NOT EXISTS (SELECT 1 FROM follow_up_steps fs WHERE fs.sequence_id = s.id);

  IF to_regclass('public.recruiter_outreach_enrollments') IS NULL THEN
    RETURN;
  END IF;

  INSERT INTO follow_up_enrollments (
    id, sequence_id, user_id, talent_pool_candidate_id, context, status,
    current_step, next_send_at, completed_at, created_at, updated_at
  )
  SELECT
    e.id, e.sequence_id, e.recruiter_id, e.talent_pool_candidate_id, COALESCE(e.metadata, '{}'::jsonb), e.status,
    e.current_step, e.next_send_at, e.completed_at, e.enrolled_at, COALESCE(e.completed_at, e.enrolled_at)
  FROM recruiter_outreach_enrollments e
  WHERE EXISTS (
    SELECT 1 FROM follow_up_sequences f
    WHERE f.id = e.sequence_id AND f.kind = 'recruiter_outreach'
  )
  ON CONFLICT DO NOTHING;
END $$;
