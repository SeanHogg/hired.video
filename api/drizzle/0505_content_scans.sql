-- Migration 0505 — Explicit-content scan verdicts (owner decision 2026-10-10).
--
-- Everything publicly visible (above all the home page's video wall, fed by
-- videos.show_on_home — migration 0504) passes a standard "explicit" scan:
-- no sexual content/nudity, weapons, gore/violence, profanity, hate or drugs.
-- One row per scanned content item, keyed by (subject_type, subject_id):
-- video / video_frames / image / profile / video_personalization. subject_id
-- is text because images are keyed by asset URL. The public feed only shows
-- videos whose effective verdict (coalesce(override_verdict, verdict)) is
-- 'pass'. Vocabulary: shared/moderation/explicit.ts. Single writer:
-- api/src/services/moderation/explicit/contentScanRepository.ts.
--
-- Idempotent: IF NOT EXISTS throughout. The CHECKs are added separately
-- because CI's drizzle-kit push may create the table before this file runs.

CREATE TABLE IF NOT EXISTS content_scans (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_type     varchar(32) NOT NULL,
  subject_id       text NOT NULL,
  owner_user_id    uuid REFERENCES users(id) ON DELETE CASCADE,
  verdict          varchar(16) NOT NULL,
  categories       text[] NOT NULL DEFAULT '{}',
  reason           text,
  input_hash       text,
  override_verdict varchar(16),
  reviewed_by      uuid REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at      timestamptz,
  scanned_at       timestamptz NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'content_scans_subject_type_check') THEN
    ALTER TABLE content_scans ADD CONSTRAINT content_scans_subject_type_check
      CHECK (subject_type IN ('video', 'video_frames', 'image', 'profile', 'video_personalization'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'content_scans_verdict_check') THEN
    ALTER TABLE content_scans ADD CONSTRAINT content_scans_verdict_check
      CHECK (verdict IN ('pass', 'block', 'unscreened'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'content_scans_override_check') THEN
    ALTER TABLE content_scans ADD CONSTRAINT content_scans_override_check
      CHECK (override_verdict IS NULL OR override_verdict IN ('pass', 'block'));
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_content_scans_subject
  ON content_scans (subject_type, subject_id);
CREATE INDEX IF NOT EXISTS idx_content_scans_input_hash
  ON content_scans (subject_type, input_hash);
CREATE INDEX IF NOT EXISTS idx_content_scans_verdict
  ON content_scans (subject_type, verdict, scanned_at DESC);
CREATE INDEX IF NOT EXISTS idx_content_scans_owner
  ON content_scans (owner_user_id);
