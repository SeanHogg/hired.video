-- Migration: 0118_live_screening_sessions
--
-- ZipIntro-style live screening blocks. A recruiter declares a window
-- (e.g. "Tuesday 1:00-3:00pm PT, 8-min slots"), the system matches
-- candidates against the attached job (or supplied criteria), and
-- back-to-back invites are dispatched. Candidates accept/decline via
-- a tokenised public URL — no auth required, so we can drive the flow
-- from email/SMS deep links.
--
-- We deliberately don't ship a WebRTC peer connection in this pass.
-- The recruiter pastes an external meeting URL (Zoom / Meet / Whereby);
-- the platform owns matching, scheduling, reminders, and the candidate-
-- facing accept flow. A future migration can layer a WebRTC room
-- behind the same `meeting_url` field.
--
-- Status lifecycle (sessions):
--   draft     → being configured by the recruiter
--   scheduled → window committed; invites being dispatched
--   running   → start_time has passed; meetings happening
--   completed → end_time has passed
--   cancelled → recruiter killed it
--
-- Status lifecycle (invites):
--   pending   → invite issued, no candidate response
--   accepted  → candidate confirmed their slot
--   declined  → candidate declined
--   no_show   → flagged by recruiter post-session
--   completed → recruiter marked meeting as done

CREATE TABLE IF NOT EXISTS live_screening_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  recruiter_id uuid NOT NULL REFERENCES users(id)        ON DELETE CASCADE,
  job_id       uuid              REFERENCES job_items(id) ON DELETE SET NULL,
  title        varchar(255) NOT NULL,

  start_time timestamptz NOT NULL,
  end_time   timestamptz NOT NULL,
  slot_minutes integer NOT NULL DEFAULT 8 CHECK (slot_minutes BETWEEN 3 AND 60),

  -- External meeting URL (Zoom/Meet/Whereby). Optional during draft,
  -- enforced by the route layer once status flips to 'scheduled'.
  meeting_url text,

  -- Hint set on the session so /invite calls can re-match without the
  -- recruiter restating their criteria each time.
  criteria jsonb NOT NULL DEFAULT '{}'::jsonb,

  status varchar(20) NOT NULL DEFAULT 'draft',

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_live_screening_sessions_recruiter
  ON live_screening_sessions (recruiter_id, start_time DESC);

CREATE INDEX IF NOT EXISTS idx_live_screening_sessions_status_window
  ON live_screening_sessions (status, start_time);

CREATE TABLE IF NOT EXISTS live_screening_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  session_id   uuid NOT NULL REFERENCES live_screening_sessions(id) ON DELETE CASCADE,
  candidate_id uuid           REFERENCES users(id)                 ON DELETE SET NULL,
  candidate_name  varchar(255) NOT NULL,
  candidate_email varchar(255),

  -- The single back-to-back slot assigned to this candidate.
  slot_start timestamptz NOT NULL,
  slot_end   timestamptz NOT NULL,

  -- Public unguessable token used by /api/live-screen/invites/:token.
  -- 32-byte cryptographic random; URL-safe base64 ≈ 43 chars.
  invite_token varchar(64) NOT NULL,

  status varchar(20) NOT NULL DEFAULT 'pending',
  responded_at timestamptz,
  response_notes text,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uniq_live_screening_invites_token
  ON live_screening_invites (invite_token);

-- Session-page query: list every invite for a session in slot order.
CREATE INDEX IF NOT EXISTS idx_live_screening_invites_session_slot
  ON live_screening_invites (session_id, slot_start);

-- One slot per candidate per session — prevents double-booking the same
-- candidate when the scheduler is re-run.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_live_screening_invites_session_candidate
  ON live_screening_invites (session_id, candidate_id)
  WHERE candidate_id IS NOT NULL;
