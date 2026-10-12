-- Migration: Article review workflow + Articles/FAQ/Guide kinds (#196 follow-up)
--
-- The original /articles flow ran the AI quality classifier inline and either
-- published or auto-flagged. We now require an explicit SuperAdmin review for
-- everything a creator submits, with bulk scan + bulk approve in the admin
-- queue.
--
-- New lifecycle:
--   draft -> submitted -> published      (SA approved)
--                     `-> rejected       (SA rejected; creator can revise -> draft)
--
-- "flagged" + "unlisted" remain reserved for post-publish abuse-report
-- moderation (see content_reports). Pre-publish review uses the new statuses.
--
-- "kind" lets creators publish three article specialisations: article / faq /
-- guide. Same storage shape, different surface treatment downstream.
--
-- Moderation findings (profanity, racism, ToS hits, etc.) are stored as JSON
-- so the SA UI can render the chips without re-scanning. The score is the
-- 0..1 overall safety score (1 = clean, 0 = block).

-- Kind: article | faq | guide. Defaults to "article" so existing rows are
-- unchanged.
ALTER TABLE articles
  ADD COLUMN IF NOT EXISTS kind VARCHAR(16) NOT NULL DEFAULT 'article';

-- Submission timestamps + actor pointers for the review lifecycle.
ALTER TABLE articles
  ADD COLUMN IF NOT EXISTS submitted_for_review_at TIMESTAMPTZ;

ALTER TABLE articles
  ADD COLUMN IF NOT EXISTS approved_by UUID REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE articles
  ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ;

ALTER TABLE articles
  ADD COLUMN IF NOT EXISTS rejected_by UUID REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE articles
  ADD COLUMN IF NOT EXISTS rejected_at TIMESTAMPTZ;

ALTER TABLE articles
  ADD COLUMN IF NOT EXISTS rejection_reason TEXT;

-- Moderation scan output. score is 0..1 overall safety (existing
-- quality_score remains for the editorial-quality dimension). findings is
-- a structured JSON payload: { profanity: string[], racism: string[],
-- tosViolations: string[], severity: 'low'|'medium'|'high'|'block' }.
ALTER TABLE articles
  ADD COLUMN IF NOT EXISTS moderation_score REAL;

ALTER TABLE articles
  ADD COLUMN IF NOT EXISTS moderation_findings JSONB;

ALTER TABLE articles
  ADD COLUMN IF NOT EXISTS moderation_scanned_at TIMESTAMPTZ;

ALTER TABLE articles
  ADD COLUMN IF NOT EXISTS moderation_scanned_by UUID REFERENCES users(id) ON DELETE SET NULL;

-- Queue index for the SA review surface (partial — only the rows actually
-- pending decision are interesting). Includes submitted_for_review_at so the
-- queue orders FIFO without a separate sort step.
CREATE INDEX IF NOT EXISTS idx_articles_review_queue
  ON articles (submitted_for_review_at)
  WHERE status = 'submitted';

-- Filter index for the "by kind" admin and public listings.
CREATE INDEX IF NOT EXISTS idx_articles_kind_status
  ON articles (kind, status, published_at DESC);
