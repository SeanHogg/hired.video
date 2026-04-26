-- Migration: Creator-authored Articles (#170 foundation)
--
-- Foundation only — engagement tracking (#171), Partner Program payout pool
-- (#172–#175) deferred until the payout rail is ready. Scope here is just:
-- creators write, save drafts, publish, articles surface in /search?category=articles.
--
-- The static editorial blog at frontend/data/blog-posts.ts stays as-is. This
-- table backs user-authored articles only.

CREATE TABLE IF NOT EXISTS articles (
  id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID         NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  slug            VARCHAR(255) NOT NULL,
  title           VARCHAR(255) NOT NULL,
  -- Markdown body. Editor v1 is a textarea + react-markdown preview; we can
  -- swap in Tiptap (#170) later without changing the storage shape.
  body_md         TEXT         NOT NULL DEFAULT '',
  -- AI-generated summary used as the search-result snippet. Optional.
  summary         TEXT,
  cover_image_url TEXT,
  category        VARCHAR(100),
  tags            JSONB        NOT NULL DEFAULT '[]'::jsonb,

  -- draft | published | unlisted | flagged
  status          VARCHAR(32)  NOT NULL DEFAULT 'draft',
  published_at    TIMESTAMPTZ,

  -- AI quality classifier output (#175). Score 0..1; rationale is the LLM's
  -- short explanation. Both nullable — articles can publish without scoring.
  quality_score        REAL,
  quality_rationale    TEXT,
  quality_checked_at   TIMESTAMPTZ,

  view_count      INTEGER      NOT NULL DEFAULT 0,
  read_minutes    INTEGER      NOT NULL DEFAULT 0,

  created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_articles_user
  ON articles (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_articles_status_published
  ON articles (status, published_at DESC)
  WHERE status = 'published';

-- Slugs are unique per author (allows two authors to use the same slug, which
-- is fine because the public URL is /articles/:authorSlug/:slug or similar).
CREATE UNIQUE INDEX IF NOT EXISTS uq_articles_user_slug
  ON articles (user_id, slug);
