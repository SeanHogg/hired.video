-- 0200_resume_feedback.sql
-- Resume feedback & career coaching (#1946).
--
--   • resume_reviews            — one feedback engagement on one resume
--   • resume_review_annotations — sticky notes / highlights / comments
--   • resume_versions           — proposal columns (reviewer-submitted draft)
--   • creator_profiles          — coaching_active program flag
--
-- Enums mirror shared/resume-feedback.ts + shared/creator-programs.ts.
-- Idempotent per drizzle/TEMPLATE.md.

-- ── resume_reviews ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS resume_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  resume_id UUID NOT NULL REFERENCES resume_information(id) ON DELETE CASCADE,
  owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reviewer_id UUID REFERENCES users(id) ON DELETE SET NULL,
  reviewer_email VARCHAR(320),
  share_token VARCHAR(64) NOT NULL,
  source VARCHAR(16) NOT NULL DEFAULT 'self_share',
  coaching_inquiry_id UUID REFERENCES service_inquiries(id) ON DELETE SET NULL,
  title VARCHAR(160),
  status VARCHAR(16) NOT NULL DEFAULT 'pending',
  message TEXT,
  expires_at TIMESTAMPTZ,
  submitted_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_resume_reviews_resume ON resume_reviews(resume_id);
CREATE INDEX IF NOT EXISTS idx_resume_reviews_owner_created ON resume_reviews(owner_id, created_at);
CREATE INDEX IF NOT EXISTS idx_resume_reviews_reviewer_created ON resume_reviews(reviewer_id, created_at);
CREATE UNIQUE INDEX IF NOT EXISTS uq_resume_reviews_share_token ON resume_reviews(share_token);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'resume_reviews_source_check') THEN
    ALTER TABLE resume_reviews
      ADD CONSTRAINT resume_reviews_source_check
      CHECK (source IN ('self_share', 'coaching')) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'resume_reviews_status_check') THEN
    ALTER TABLE resume_reviews
      ADD CONSTRAINT resume_reviews_status_check
      CHECK (status IN ('pending', 'active', 'submitted', 'completed', 'cancelled')) NOT VALID;
  END IF;
END $$;

-- ── resume_review_annotations ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS resume_review_annotations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  review_id UUID NOT NULL REFERENCES resume_reviews(id) ON DELETE CASCADE,
  author_id UUID REFERENCES users(id) ON DELETE SET NULL,
  kind VARCHAR(16) NOT NULL,
  body TEXT NOT NULL,
  color VARCHAR(16),
  status VARCHAR(16) NOT NULL DEFAULT 'open',
  page_id VARCHAR(64),
  anchor JSONB NOT NULL,
  suggested_edit JSONB,
  parent_annotation_id UUID REFERENCES resume_review_annotations(id) ON DELETE CASCADE,
  resolved_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_resume_annotations_review_created ON resume_review_annotations(review_id, created_at);
CREATE INDEX IF NOT EXISTS idx_resume_annotations_parent ON resume_review_annotations(parent_annotation_id);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'resume_annotations_kind_check') THEN
    ALTER TABLE resume_review_annotations
      ADD CONSTRAINT resume_annotations_kind_check
      CHECK (kind IN ('sticky_note', 'highlight', 'comment')) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'resume_annotations_status_check') THEN
    ALTER TABLE resume_review_annotations
      ADD CONSTRAINT resume_annotations_status_check
      CHECK (status IN ('open', 'accepted', 'dismissed', 'resolved')) NOT VALID;
  END IF;
END $$;

-- ── resume_versions: reviewer-proposed draft columns ─────────────────────────
ALTER TABLE resume_versions ADD COLUMN IF NOT EXISTS proposed_by_user_id UUID;
ALTER TABLE resume_versions ADD COLUMN IF NOT EXISTS review_id UUID;
ALTER TABLE resume_versions ADD COLUMN IF NOT EXISTS proposal_status VARCHAR(16);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'resume_versions_proposed_by_fkey') THEN
    ALTER TABLE resume_versions
      ADD CONSTRAINT resume_versions_proposed_by_fkey
      FOREIGN KEY (proposed_by_user_id) REFERENCES users(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'resume_versions_review_fkey') THEN
    ALTER TABLE resume_versions
      ADD CONSTRAINT resume_versions_review_fkey
      FOREIGN KEY (review_id) REFERENCES resume_reviews(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'resume_versions_proposal_status_check') THEN
    ALTER TABLE resume_versions
      ADD CONSTRAINT resume_versions_proposal_status_check
      CHECK (proposal_status IS NULL OR proposal_status IN ('proposed', 'accepted', 'rejected')) NOT VALID;
  END IF;
END $$;

-- Index the reviewer-proposal lookup ("proposals for this review").
CREATE INDEX IF NOT EXISTS idx_resume_versions_review
  ON resume_versions(review_id)
  WHERE review_id IS NOT NULL;

-- ── creator_profiles: coaching program flag ──────────────────────────────────
ALTER TABLE creator_profiles ADD COLUMN IF NOT EXISTS coaching_active BOOLEAN NOT NULL DEFAULT false;
