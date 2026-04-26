-- Migration: Courses becomes the 5th Creator Program
--
-- Same model as Articles (#199): per-program flag on the active enrolment row,
-- dedicated terms doc with explicit acceptance ledger, cancel = flip to false.

ALTER TABLE creator_profiles
  ADD COLUMN IF NOT EXISTS courses_active BOOLEAN NOT NULL DEFAULT FALSE;

INSERT INTO legal_documents (kind, version, title, summary, body, locale, is_current, published_at)
VALUES
  (
    'program_courses_terms', 'v1', 'Courses Creator Program Terms',
    'Terms for authoring and selling courses (with optional certifications) on hired.video.',
    'Placeholder Courses program terms. Update via the legal admin UI before going live.',
    'en', TRUE, NOW()
  )
ON CONFLICT (kind, version, locale) DO NOTHING;
