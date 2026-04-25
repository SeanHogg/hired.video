-- Migration: Creator Program enrollment becomes event-log style
--
-- Each enrollment is a row. Cancel-everything sets ended_at; cancel a single
-- program flips its per-program flag false but the row stays open. Re-enrolling
-- after a full cancel inserts a new row.
--
-- Per-program flags (video / voice / services) replace the single is_active
-- boolean, but is_active is retained as a derived flag (true when at least one
-- program flag is true and ended_at IS NULL) so existing read paths in og.ts
-- and creators.ts keep working.

-- 1. Allow many rows per user
ALTER TABLE creator_profiles
  DROP CONSTRAINT IF EXISTS creator_profiles_user_id_key;
ALTER TABLE creator_profiles
  DROP CONSTRAINT IF EXISTS creator_profiles_user_id_unique;

-- 2. Per-enrollment lifecycle
ALTER TABLE creator_profiles
  ADD COLUMN IF NOT EXISTS ended_at TIMESTAMPTZ;

-- 3. Per-program flags
ALTER TABLE creator_profiles
  ADD COLUMN IF NOT EXISTS video_active     BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS voice_active     BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS services_active  BOOLEAN NOT NULL DEFAULT FALSE;

-- 4. Only one active enrollment row per user at a time
CREATE UNIQUE INDEX IF NOT EXISTS uq_creator_profiles_user_active
  ON creator_profiles (user_id)
  WHERE ended_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_creator_profiles_user_ended_at
  ON creator_profiles (user_id, ended_at);

-- 5. Seed placeholder per-program terms documents so the enrollment wizard
--    can require explicit acceptance for each program from day one. A
--    superadmin can later publish v2 of any of these via the legal admin UI;
--    the partial unique on (kind, locale) WHERE is_current=true ensures only
--    one current row per (kind, locale) so the publish flow already handles
--    superseding the placeholder cleanly.
INSERT INTO legal_documents (kind, version, title, summary, body, locale, is_current, published_at)
VALUES
  (
    'program_video_terms', 'v1', 'Video Promo Program Terms',
    'Terms for the Video Promo creator program (promo videos, escrow, revisions, payouts).',
    'Placeholder Video Promo program terms. Update via the legal admin UI before going live.',
    'en', TRUE, NOW()
  ),
  (
    'program_voice_terms', 'v1', 'Voice Clone Program Terms',
    'Terms for the Voice Clone creator program (voice cloning, marketplace listings, payouts).',
    'Placeholder Voice Clone program terms. Update via the legal admin UI before going live.',
    'en', TRUE, NOW()
  ),
  (
    'program_services_terms', 'v1', 'Services Program Terms',
    'Terms for the Services creator program (career-coaching, resume review, lead-gen inquiries).',
    'Placeholder Services program terms. Update via the legal admin UI before going live.',
    'en', TRUE, NOW()
  )
ON CONFLICT (kind, version, locale) DO NOTHING;

