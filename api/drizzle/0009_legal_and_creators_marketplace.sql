-- Migration: Legal Documents + Creator / Promo-Video Marketplace (gap #101)
--
-- Adds:
--   • legal_documents + legal_document_acceptances — superadmin-managed
--     versioned terms / policies with per-user acceptance ledger.
--   • creator_profiles                              — opt-in creator state, payout, fee, stats
--   • portfolio_items                               — reusable creator gallery (1 featured/user)
--   • promo_projects                                — production transactions w/ escrow
--   • promo_project_revisions                       — submitted cuts (3 included, paid extras)
--   • promo_project_extra_revision_purchases        — line items for revisions 4+
--   • promo_project_reviews                         — customer rating + review post-acceptance
--
-- Creator opt-in is gated at the API layer on (a) active paid subscription
-- via existing billing service and (b) acceptance of the current
-- creator_terms document. No inline terms snapshot — everything legal is
-- centralised in legal_document_acceptances.

-- ────────────────────────────────────────────────────────────────────────────
-- 1. Legal documents
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS legal_documents (
  id            UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  kind          VARCHAR(64)  NOT NULL,
  version       VARCHAR(32)  NOT NULL,
  title         VARCHAR(255) NOT NULL,
  summary       TEXT,
  body          TEXT         NOT NULL,
  locale        VARCHAR(10)  NOT NULL DEFAULT 'en',
  is_current    BOOLEAN      NOT NULL DEFAULT FALSE,
  published_at  TIMESTAMPTZ,
  published_by  UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_legal_documents_kind
  ON legal_documents (kind);

-- Only one current document per (kind, locale).
CREATE UNIQUE INDEX IF NOT EXISTS uq_legal_documents_current_kind
  ON legal_documents (kind, locale)
  WHERE is_current = TRUE;

CREATE UNIQUE INDEX IF NOT EXISTS uq_legal_documents_kind_version_locale
  ON legal_documents (kind, version, locale);

CREATE TABLE IF NOT EXISTS legal_document_acceptances (
  id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID         NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  document_id UUID         NOT NULL REFERENCES legal_documents(id) ON DELETE RESTRICT,
  kind        VARCHAR(64)  NOT NULL,
  version     VARCHAR(32)  NOT NULL,
  locale      VARCHAR(10)  NOT NULL DEFAULT 'en',
  accepted_at TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  ip          TEXT,
  user_agent  TEXT,
  context     VARCHAR(64)
);

CREATE INDEX IF NOT EXISTS idx_legal_acceptances_user
  ON legal_document_acceptances (user_id);
CREATE INDEX IF NOT EXISTS idx_legal_acceptances_kind
  ON legal_document_acceptances (kind);
CREATE INDEX IF NOT EXISTS idx_legal_acceptances_user_kind
  ON legal_document_acceptances (user_id, kind, accepted_at);

-- ────────────────────────────────────────────────────────────────────────────
-- 2. Creator profiles
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS creator_profiles (
  id                          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                     UUID         NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,

  is_active                   BOOLEAN      NOT NULL DEFAULT FALSE,
  display_name                VARCHAR(255),
  tagline                     VARCHAR(255),
  bio                         TEXT,
  categories                  JSONB        NOT NULL DEFAULT '[]'::jsonb,
  languages                   JSONB        NOT NULL DEFAULT '[]'::jsonb,

  payout_provider             VARCHAR(32),
  payout_account_id           TEXT,
  payout_onboarded_at         TIMESTAMPTZ,
  payout_country              VARCHAR(2),
  payout_currency             VARCHAR(10)  NOT NULL DEFAULT 'USD',

  default_price_cents         INTEGER      NOT NULL DEFAULT 0,
  extra_revision_price_cents  INTEGER      NOT NULL DEFAULT 0,
  average_delivery_days       INTEGER,

  platform_fee_bps            INTEGER      NOT NULL DEFAULT 1500,

  completed_projects_count    INTEGER      NOT NULL DEFAULT 0,
  total_earned_cents          INTEGER      NOT NULL DEFAULT 0,
  average_rating              REAL,
  rating_count                INTEGER      NOT NULL DEFAULT 0,
  response_hours              REAL,

  created_at                  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at                  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_creator_profiles_active ON creator_profiles (is_active);
CREATE INDEX IF NOT EXISTS idx_creator_profiles_rating ON creator_profiles (average_rating);

-- ────────────────────────────────────────────────────────────────────────────
-- 3. Portfolio items (reusable gallery, 1 featured per user)
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS portfolio_items (
  id                       UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                  UUID         NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  title                    VARCHAR(255) NOT NULL,
  description              TEXT,
  media_type               VARCHAR(20)  NOT NULL,    -- 'video' | 'image'
  media_url                TEXT         NOT NULL,
  thumbnail_url            TEXT,
  duration_ms              INTEGER,

  source                   VARCHAR(20)  NOT NULL DEFAULT 'upload',  -- 'upload' | 'promo_project'
  source_promo_project_id  UUID,
  customer_consent         BOOLEAN      NOT NULL DEFAULT FALSE,

  category                 VARCHAR(100),
  tags                     JSONB        NOT NULL DEFAULT '[]'::jsonb,

  is_featured              BOOLEAN      NOT NULL DEFAULT FALSE,
  sort_order               INTEGER      NOT NULL DEFAULT 0,
  is_public                BOOLEAN      NOT NULL DEFAULT TRUE,
  view_count               INTEGER      NOT NULL DEFAULT 0,

  created_at               TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at               TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_portfolio_items_user ON portfolio_items (user_id);

-- Enforce at most one featured item per creator (partial unique index).
CREATE UNIQUE INDEX IF NOT EXISTS uq_portfolio_featured_per_user
  ON portfolio_items (user_id)
  WHERE is_featured = TRUE;

-- ────────────────────────────────────────────────────────────────────────────
-- 4. Promo projects
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS promo_projects (
  id                  UUID         PRIMARY KEY DEFAULT gen_random_uuid(),

  customer_id         UUID         NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  creator_id          UUID         NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  inquiry_id          UUID REFERENCES service_inquiries(id) ON DELETE SET NULL,
  service_offering_id UUID REFERENCES service_offerings(id) ON DELETE SET NULL,
  conversation_id     UUID REFERENCES conversations(id) ON DELETE SET NULL,

  studio_project_id   TEXT,

  brief_resume_id     UUID,
  brief_job_id        UUID,
  brief_notes         TEXT,
  brief_assets        JSONB        NOT NULL DEFAULT '[]'::jsonb,

  title               VARCHAR(255) NOT NULL,
  status              VARCHAR(32)  NOT NULL DEFAULT 'brief',

  revisions_allowed   INTEGER      NOT NULL DEFAULT 3,
  revisions_used      INTEGER      NOT NULL DEFAULT 0,

  price_cents         INTEGER      NOT NULL,
  currency            VARCHAR(10)  NOT NULL DEFAULT 'USD',
  platform_fee_bps    INTEGER      NOT NULL DEFAULT 1500,
  platform_fee_cents  INTEGER      NOT NULL DEFAULT 0,
  creator_cut_cents   INTEGER      NOT NULL DEFAULT 0,

  payment_ref         TEXT,
  paid_at             TIMESTAMPTZ,
  escrow_released_at  TIMESTAMPTZ,
  auto_release_at     TIMESTAMPTZ,

  delivered_video_url TEXT,
  delivered_at        TIMESTAMPTZ,
  accepted_at         TIMESTAMPTZ,
  cancelled_at        TIMESTAMPTZ,

  portfolio_consent   BOOLEAN      NOT NULL DEFAULT FALSE,

  created_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_promo_projects_customer ON promo_projects (customer_id);
CREATE INDEX IF NOT EXISTS idx_promo_projects_creator  ON promo_projects (creator_id);
CREATE INDEX IF NOT EXISTS idx_promo_projects_status   ON promo_projects (status);
CREATE INDEX IF NOT EXISTS idx_promo_projects_inquiry  ON promo_projects (inquiry_id);

-- ────────────────────────────────────────────────────────────────────────────
-- 5. Promo project revisions
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS promo_project_revisions (
  id                 UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id         UUID         NOT NULL REFERENCES promo_projects(id) ON DELETE CASCADE,
  revision_number    INTEGER      NOT NULL,
  is_paid_extra      BOOLEAN      NOT NULL DEFAULT FALSE,

  storyboard_snapshot JSONB,
  video_url          TEXT,
  thumbnail_url      TEXT,
  duration_ms        INTEGER,
  creator_notes      TEXT,

  submitted_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

  customer_decision  VARCHAR(20)  NOT NULL DEFAULT 'pending',  -- pending | approved | changes_requested
  customer_feedback  TEXT,
  decided_at         TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_promo_revisions_project ON promo_project_revisions (project_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_promo_revisions_project_number
  ON promo_project_revisions (project_id, revision_number);

-- ────────────────────────────────────────────────────────────────────────────
-- 6. Extra revision purchases (revisions 4+)
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS promo_project_extra_revision_purchases (
  id                  UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id          UUID         NOT NULL REFERENCES promo_projects(id) ON DELETE CASCADE,
  customer_id         UUID         NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  price_cents         INTEGER      NOT NULL,
  currency            VARCHAR(10)  NOT NULL DEFAULT 'USD',
  platform_fee_bps    INTEGER      NOT NULL DEFAULT 1500,
  platform_fee_cents  INTEGER      NOT NULL DEFAULT 0,
  creator_cut_cents   INTEGER      NOT NULL DEFAULT 0,

  payment_ref         TEXT,
  paid_at             TIMESTAMPTZ,
  revisions_added     INTEGER      NOT NULL DEFAULT 1,

  created_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_extra_rev_purchases_project
  ON promo_project_extra_revision_purchases (project_id);

-- ────────────────────────────────────────────────────────────────────────────
-- 7. Promo project reviews
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS promo_project_reviews (
  id                   UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id           UUID         NOT NULL UNIQUE REFERENCES promo_projects(id) ON DELETE CASCADE,
  customer_id          UUID         NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  creator_id           UUID         NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  rating               INTEGER      NOT NULL CHECK (rating BETWEEN 1 AND 5),
  title                VARCHAR(255),
  body                 TEXT,

  communication_score  INTEGER,
  quality_score        INTEGER,
  timeliness_score     INTEGER,

  is_public            BOOLEAN      NOT NULL DEFAULT TRUE,
  creator_reply        TEXT,
  creator_replied_at   TIMESTAMPTZ,

  created_at           TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_promo_reviews_creator ON promo_project_reviews (creator_id);
