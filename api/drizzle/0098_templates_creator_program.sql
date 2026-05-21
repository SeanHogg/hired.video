-- Migration: Templates becomes the 6th Creator Program
--
-- Same model as Articles (#199) and Courses: per-program flag on the active
-- enrolment row, dedicated terms doc with explicit acceptance ledger,
-- cancel = flip to false. Gates the user's ability to publish resume / job /
-- studio templates to the marketplace at /search?category=templates.

ALTER TABLE creator_profiles
  ADD COLUMN IF NOT EXISTS templates_active BOOLEAN NOT NULL DEFAULT FALSE;

INSERT INTO legal_documents (kind, version, title, summary, body, locale, is_current, published_at)
VALUES
  (
    'program_templates_terms', 'v1', 'Templates Creator Program Terms',
    'Terms for publishing resume, job, and studio video templates to the hired.video marketplace.',
    'Placeholder Templates program terms. Update via the legal admin UI before going live.',
    'en', TRUE, NOW()
  )
ON CONFLICT (kind, version, locale) DO NOTHING;
