-- Migration: Articles becomes the 4th Creator Program
--
-- Articles publishing (#196) is gated behind explicit enrollment in the
-- Creator Program "articles" sub-program. Mirrors the video/voice/services
-- model: per-program flag on the active enrollment row, dedicated terms doc
-- with explicit acceptance ledger, cancel = flip to false.

ALTER TABLE creator_profiles
  ADD COLUMN IF NOT EXISTS articles_active BOOLEAN NOT NULL DEFAULT FALSE;

INSERT INTO legal_documents (kind, version, title, summary, body, locale, is_current, published_at)
VALUES
  (
    'program_articles_terms', 'v1', 'Articles Creator Program Terms',
    'Terms for publishing user-authored articles to the hired.video community feed and search.',
    'Placeholder Articles program terms. Update via the legal admin UI before going live.',
    'en', TRUE, NOW()
  )
ON CONFLICT (kind, version, locale) DO NOTHING;
