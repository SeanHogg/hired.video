-- 0206_inbox_profiles.sql
-- Role-aware inbox processors — Phase 1: profile foundation (#1979).
--
--   • inbox_profiles                  — role-keyed classifier aggregate
--   • external_email_accounts         — rename min_job_score → min_relevance_score,
--                                        add active_profile_id FK
--   • email_user_rules                — add profile_id FK (NULL = legacy global)
--   • external_email_messages         — add extracted jsonb + is_relevant bool
--   • seed Job Hunter preset          — byte-for-byte reproduction of today's
--                                        job-seeker classifier (zero-regression)
--
-- Preset bodies mirror shared/email-classification/presets.ts (parity-tested).
-- Idempotent per drizzle/TEMPLATE.md.

-- ── inbox_profiles ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS inbox_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID REFERENCES users(id) ON DELETE CASCADE,
  roles JSONB NOT NULL DEFAULT '[]'::jsonb,
  name VARCHAR(120) NOT NULL,
  description TEXT,
  is_preset BOOLEAN NOT NULL DEFAULT false,
  preset_key VARCHAR(64),
  taxonomy JSONB NOT NULL,
  classify_prompt TEXT NOT NULL,
  summary_prompt TEXT,
  extract_schema JSONB,
  default_rule_set VARCHAR(32),
  min_relevance_score NUMERIC(4,3) NOT NULL DEFAULT '0.500',
  version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS inbox_profiles_owner_idx ON inbox_profiles(owner_id);
CREATE UNIQUE INDEX IF NOT EXISTS inbox_profiles_preset_key_key ON inbox_profiles(preset_key);

-- ── external_email_accounts: rename + active_profile_id ──────────────────────
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'external_email_accounts' AND column_name = 'min_job_score'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'external_email_accounts' AND column_name = 'min_relevance_score'
  ) THEN
    ALTER TABLE external_email_accounts RENAME COLUMN min_job_score TO min_relevance_score;
  END IF;
END $$;

-- Belt-and-braces: ensure the column exists even on a DB that never had
-- min_job_score (fresh schema-parity provisioning paths).
ALTER TABLE external_email_accounts
  ADD COLUMN IF NOT EXISTS min_relevance_score NUMERIC(4,3) NOT NULL DEFAULT '0.500';

ALTER TABLE external_email_accounts
  ADD COLUMN IF NOT EXISTS active_profile_id UUID;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'external_email_accounts_active_profile_fkey') THEN
    ALTER TABLE external_email_accounts
      ADD CONSTRAINT external_email_accounts_active_profile_fkey
      FOREIGN KEY (active_profile_id) REFERENCES inbox_profiles(id) ON DELETE SET NULL;
  END IF;
END $$;

-- ── email_user_rules: profile_id ─────────────────────────────────────────────
ALTER TABLE email_user_rules
  ADD COLUMN IF NOT EXISTS profile_id UUID;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'email_user_rules_profile_fkey') THEN
    ALTER TABLE email_user_rules
      ADD CONSTRAINT email_user_rules_profile_fkey
      FOREIGN KEY (profile_id) REFERENCES inbox_profiles(id) ON DELETE CASCADE;
  END IF;
END $$;

-- ── external_email_messages: extracted + is_relevant ─────────────────────────
ALTER TABLE external_email_messages
  ADD COLUMN IF NOT EXISTS extracted JSONB;
ALTER TABLE external_email_messages
  ADD COLUMN IF NOT EXISTS is_relevant BOOLEAN NOT NULL DEFAULT false;

-- Backfill is_relevant from today's visibility rule (JOB_INBOX_CATEGORIES) so
-- already-synced job-seeker mail keeps showing in the inbox after the read
-- query switches from a category-list filter to is_relevant (zero-regression).
UPDATE external_email_messages
SET is_relevant = true
WHERE is_relevant = false
  AND category IN (
    'job_opportunity', 'application_status', 'recruiter_outreach',
    'interview_invite', 'offer', 'rejection'
  );

-- ── Seed: Job Hunter preset (the zero-regression default) ────────────────────
INSERT INTO inbox_profiles (
  id, owner_id, roles, name, description, is_preset, preset_key,
  taxonomy, classify_prompt, summary_prompt, extract_schema,
  default_rule_set, min_relevance_score, version
) VALUES (
  '10b0c0de-0000-4000-a000-000000000001',
  NULL,
  '["job_seeker"]'::jsonb,
  'Job Hunter',
  'The default candidate inbox — surfaces opportunities, application status, interviews, offers and rejections.',
  true,
  'job_hunter',
  '[
    {"key":"job_opportunity","label":"Opportunity","description":"inbound recruiter pitch about a specific role or list of roles","visible":true},
    {"key":"application_status","label":"Application status","description":"ATS notification / hiring team update on an application you submitted","visible":true},
    {"key":"recruiter_outreach","label":"Recruiter outreach","description":"recruiter introduction without a specific role yet","visible":true},
    {"key":"interview_invite","label":"Interview invite","description":"scheduling or invitation to an interview / phone screen","visible":true},
    {"key":"offer","label":"Offer","description":"job offer extended","visible":true},
    {"key":"rejection","label":"Rejection","description":"decision-not-to-move-forward email","visible":true},
    {"key":"newsletter","label":"Newsletter","description":"job-board digest, marketing newsletter","visible":false},
    {"key":"spam","label":"Spam","description":"unsolicited bulk, scam, fraudulent","visible":false},
    {"key":"personal","label":"Personal","description":"friend/family/personal correspondence","visible":false},
    {"key":"other","label":"Other","description":"does not fit any category above","visible":false}
  ]'::jsonb,
  $classify$You classify an email for a job-seeker's inbox.
Return ONLY a JSON object: { "category": "...", "score": 0.NN, "reason": "..." }.
Allowed categories:
- job_opportunity   = inbound recruiter pitch about a specific role or list of roles
- application_status= ATS notification / hiring team update on an application the candidate submitted
- recruiter_outreach= recruiter introduction without a specific role yet
- interview_invite  = scheduling or invitation to an interview / phone screen
- offer             = job offer extended
- rejection         = decision-not-to-move-forward email
- newsletter        = job board digest, marketing newsletter
- spam              = unsolicited bulk, scam, fraudulent
- personal          = friend/family/personal correspondence
- other             = does not fit the above

score = your confidence in [0, 1].$classify$,
  $summary$You produce a one-sentence summary of an email for a job-seeker's inbox.
Constraints:
- One sentence, max 25 words.
- Lead with the most actionable detail (date, role, company, action requested).
- Plain text, no markdown, no quoting.
$summary$,
  NULL,
  'job_seeker',
  '0.500',
  1
)
ON CONFLICT (id) DO NOTHING;
