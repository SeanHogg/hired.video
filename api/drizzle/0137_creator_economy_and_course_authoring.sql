-- ============================================================================
-- Migration 0137 — Creator Economy + Course Authoring Sweep
-- ============================================================================
-- Closes a batch of P1 / P2 gap-register items in one pass because they share
-- infrastructure (consent + payout + legal-docs + engagement tracking):
--   #158  Resume Template marketplace consent
--   #162  AI course + quiz generator                — app-layer (no schema)
--   #163  PowerPoint → eLearning conversion         — app-layer (no schema)
--   #164  Screen recorder polish                    — app-layer (no schema)
--   #165  Certificate issuance + public verify URL  — uses existing schema
--   #166  Course authoring — themes & templates
--   #167  Course authoring — teams & workflows (review state)
--   #168  Course accessibility audit                — app-layer (no schema)
--   #169  Gamification — Campaign $ redemption store
--   #170  User-authored articles (extends existing articles row + versions)
--   #171  Article engagement tracking
--   #172  Partner Program payout pool + distribution
--   #173  Writer opt-in to Partner Program
--   #174  Gift-card payout integration             — uses Tremendous client
--   #175  AI article moderation classifier         — extends existing columns
--   #200  LMS connectors
--   #201  In-video knowledge checks (studioVideoForms extension)
--
-- Every table is created with IF NOT EXISTS; every ALTER is wrapped in a
-- defensive DO-block so a re-apply is a no-op. The _sql_migrations runner
-- still tracks the file as applied (feedback_fix_root_cause_not_workaround).

BEGIN;

-- ---------------------------------------------------------------------------
-- #158 — Resume Template marketplace consent.
-- Mirror VoiceCloneManager: visibility, platform fee, consent snapshot.
-- ---------------------------------------------------------------------------
ALTER TABLE resume_templates
  ADD COLUMN IF NOT EXISTS visibility VARCHAR(20) NOT NULL DEFAULT 'private',
  ADD COLUMN IF NOT EXISTS listing_slug TEXT,
  ADD COLUMN IF NOT EXISTS platform_fee_bps INTEGER NOT NULL DEFAULT 500,
  ADD COLUMN IF NOT EXISTS price_cents INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS consent_agreed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS consent_ip TEXT,
  ADD COLUMN IF NOT EXISTS consent_ua TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS uq_resume_templates_listing_slug
  ON resume_templates(listing_slug)
  WHERE listing_slug IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_resume_templates_visibility
  ON resume_templates(visibility, created_at DESC);

-- ---------------------------------------------------------------------------
-- #166 — Course themes & templates.
-- Polymorphic: theme can point at any studio_template row (template
-- marketplace) — reuses the existing template infrastructure.
-- ---------------------------------------------------------------------------
ALTER TABLE courses
  ADD COLUMN IF NOT EXISTS theme_id UUID,
  ADD COLUMN IF NOT EXISTS theme_tokens JSONB;

CREATE INDEX IF NOT EXISTS idx_courses_theme_id ON courses(theme_id);

-- ---------------------------------------------------------------------------
-- #167 — Course review workflow. Reuses studio_review_comments +
-- studio_review_links by treating projectId as the course id (subject-
-- agnostic table). No schema change beyond the new status value, which is
-- a free-form varchar.  The COURSE_STATUSES enum in shared/courses now
-- includes "in_review".
-- ---------------------------------------------------------------------------
-- (no DDL)

-- ---------------------------------------------------------------------------
-- #200 — LMS connectors (Cornerstone / Workday Learning / Docebo /
-- TalentLMS / SuccessFactors). Per-provider OAuth tokens + last-sync.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS lms_connectors (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  -- Polymorphic owner — a connector can belong to a personal account OR a
  -- company workspace. The course-export flow checks canActFor() before
  -- pushing.
  company_id      UUID,
  provider        VARCHAR(40) NOT NULL, -- "cornerstone" | "workday_learning" | "docebo" | "talentlms" | "successfactors"
  display_name    VARCHAR(255),
  base_url        TEXT,                  -- per-tenant API base
  access_token    TEXT,
  refresh_token   TEXT,
  scope           TEXT,
  expires_at      TIMESTAMPTZ,
  status          VARCHAR(20) NOT NULL DEFAULT 'connected', -- connected | revoked | error
  last_sync_at    TIMESTAMPTZ,
  last_error      TEXT,
  metadata        JSONB,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_lms_connectors_user ON lms_connectors(user_id);
CREATE INDEX IF NOT EXISTS idx_lms_connectors_provider ON lms_connectors(provider);

CREATE TABLE IF NOT EXISTS lms_course_publishes (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  connector_id    UUID NOT NULL REFERENCES lms_connectors(id) ON DELETE CASCADE,
  course_id       UUID NOT NULL,
  external_id     TEXT,
  status          VARCHAR(20) NOT NULL DEFAULT 'pending', -- pending | published | failed
  last_error      TEXT,
  pushed_at       TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_lms_course_publishes_connector
  ON lms_course_publishes(connector_id);
CREATE INDEX IF NOT EXISTS idx_lms_course_publishes_course
  ON lms_course_publishes(course_id);

-- ---------------------------------------------------------------------------
-- #201 — In-video knowledge checks (extends studio_video_forms).
-- formType discriminator: "lead_capture" (default — existing behaviour) or
-- "knowledge_check" (new). For knowledge_check, answer_key + passing_score
-- + remediation_jump_to_scene_id drive scoring. course_lesson_id links a
-- form to a lesson for cmi.score.raw reporting (#161 SCORM bridge).
-- ---------------------------------------------------------------------------
ALTER TABLE studio_video_forms
  ADD COLUMN IF NOT EXISTS form_type VARCHAR(32) NOT NULL DEFAULT 'lead_capture',
  ADD COLUMN IF NOT EXISTS answer_key JSONB,
  ADD COLUMN IF NOT EXISTS passing_score_pct INTEGER,
  ADD COLUMN IF NOT EXISTS max_attempts INTEGER,
  ADD COLUMN IF NOT EXISTS remediation_jump_to_scene_id TEXT,
  ADD COLUMN IF NOT EXISTS course_lesson_id UUID;

CREATE INDEX IF NOT EXISTS idx_studio_video_forms_lesson
  ON studio_video_forms(course_lesson_id)
  WHERE course_lesson_id IS NOT NULL;

ALTER TABLE studio_video_form_submissions
  ADD COLUMN IF NOT EXISTS score_raw INTEGER,
  ADD COLUMN IF NOT EXISTS score_max INTEGER,
  ADD COLUMN IF NOT EXISTS passed BOOLEAN,
  ADD COLUMN IF NOT EXISTS attempt_number INTEGER NOT NULL DEFAULT 1;

-- ---------------------------------------------------------------------------
-- #169 — Campaign $ redemption store. Reuses points_redemptions
-- (kind="campaign_dollars" is now a valid value); funnels grants into the
-- new campaign_dollars_balance / _transactions tables. Parallel to the
-- enrichment_credits pattern.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS campaign_dollars_balance (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  balance_cents   INTEGER NOT NULL DEFAULT 0,
  lifetime_granted_cents INTEGER NOT NULL DEFAULT 0,
  lifetime_spent_cents   INTEGER NOT NULL DEFAULT 0,
  -- Per-user redemption rate snapshot: cents granted per 1000 points.
  -- Falls back to platform default if NULL. Snapshotted on first opt-in
  -- to insulate users from later rate changes.
  rate_cents_per_1k_points INTEGER,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS campaign_dollars_transactions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  -- "grant_redemption" (points→$$), "boost_spend", "ad_spend", "refund"
  kind            VARCHAR(32) NOT NULL,
  amount_cents    INTEGER NOT NULL, -- signed; positive = credit, negative = debit
  balance_after_cents INTEGER NOT NULL,
  reference_id    TEXT,             -- redemption row id, boost id, ad id
  reference_type  VARCHAR(40),
  description     TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_campaign_dollars_tx_user
  ON campaign_dollars_transactions(user_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- #170 — User-authored articles. The existing `articles` table already
-- supports user authorship (userId FK + status workflow). What's missing
-- is the JSON body for Tiptap and the per-row version snapshots.
-- ---------------------------------------------------------------------------
ALTER TABLE articles
  ADD COLUMN IF NOT EXISTS body_json JSONB,
  ADD COLUMN IF NOT EXISTS reading_time_seconds INTEGER,
  ADD COLUMN IF NOT EXISTS partner_program_eligible BOOLEAN NOT NULL DEFAULT FALSE,
  -- Snapshotted from user's partner-program opt-in row at publish time.
  -- Audit-only — actual pool math reads from partner_payouts.
  ADD COLUMN IF NOT EXISTS platform_fee_bps_at_opt_in INTEGER;

CREATE TABLE IF NOT EXISTS article_versions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  article_id      UUID NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  version_number  INTEGER NOT NULL,
  label           VARCHAR(120),
  title           VARCHAR(255) NOT NULL,
  body_md         TEXT,
  body_json       JSONB,
  is_autosave     BOOLEAN NOT NULL DEFAULT FALSE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_article_versions_article
  ON article_versions(article_id, version_number DESC);

-- ---------------------------------------------------------------------------
-- #171 — Article engagement tracking. Per-day rollup + per-user clap
-- ledger. Only authenticated reads count toward Partner Program — the
-- ingest path filters anonymous traffic.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS article_engagement (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  article_id      UUID NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
  day             DATE NOT NULL,
  read_seconds    INTEGER NOT NULL DEFAULT 0,
  clap_count      INTEGER NOT NULL DEFAULT 0,
  share_count     INTEGER NOT NULL DEFAULT 0,
  unique_readers  INTEGER NOT NULL DEFAULT 0,
  -- Engagement from anonymous / unauthenticated viewers — tracked for
  -- analytics but EXCLUDED from the partner pool math (gap #171).
  anonymous_read_seconds INTEGER NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_article_engagement_article_day
  ON article_engagement(article_id, day);

CREATE TABLE IF NOT EXISTS article_claps (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  article_id      UUID NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  -- Medium-style: a user can clap many times for one article, up to a cap
  -- enforced in app code (50/article). Single row per (user, article).
  count           INTEGER NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_article_claps_user_article
  ON article_claps(user_id, article_id);

-- Append-only ledger of share events (analytics + abuse forensics).
CREATE TABLE IF NOT EXISTS article_shares (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  article_id      UUID NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
  user_id         UUID REFERENCES users(id) ON DELETE SET NULL,
  channel         VARCHAR(40),   -- "twitter" | "linkedin" | "email" | "copy_link" | "rss"
  user_agent      TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_article_shares_article
  ON article_shares(article_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- #173 — Writer opt-in to Partner Program. Mirrors voice-clone consent.
-- One row per (user, opt-in event). The most-recent row's is_active flag
-- gates payout eligibility; older rows preserve the audit trail.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS partner_program_opt_ins (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  -- Snapshotted at opt-in. The payout pool math always re-reads this
  -- column off the relevant article — DO NOT use this row's value at
  -- distribution time.
  platform_fee_bps_at_opt_in INTEGER NOT NULL DEFAULT 0,
  -- IDs of legal documents accepted at opt-in time. Composite snapshot:
  -- partner_program_terms is required, others optional. Resolved against
  -- legal_documents on display.
  legal_docs_accepted JSONB NOT NULL DEFAULT '[]'::jsonb,
  consent_agreed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  consent_ip      TEXT,
  consent_ua      TEXT,
  -- Earn-gate: must be active $9.95/mo Pro at opt-in. Re-validated at
  -- pool distribution time too — opting in then cancelling Pro pauses
  -- accrual until Pro is restored.
  pro_subscription_id UUID,
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  deactivated_at  TIMESTAMPTZ,
  deactivated_reason TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_partner_program_opt_ins_user
  ON partner_program_opt_ins(user_id, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS uq_partner_program_opt_ins_active_per_user
  ON partner_program_opt_ins(user_id)
  WHERE is_active = TRUE;

-- ---------------------------------------------------------------------------
-- #172 — Partner Program payout pool. Monthly rows; the distribution
-- cron in scheduled.ts writes one row per (user, period) for periods
-- where their engagement-weighted share > $0.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS partner_payout_periods (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  period_start    DATE NOT NULL UNIQUE,
  period_end      DATE NOT NULL,
  -- 50 = 0.5%. Stored per-period so we can adjust the contribution rate
  -- without re-writing history.
  pool_funding_bps INTEGER NOT NULL DEFAULT 50,
  -- Snapshotted at close — sum of paid-subscriber revenue for the period
  -- (cents). Drives pool_total_cents = revenue_cents * pool_funding_bps / 10000.
  subscriber_revenue_cents INTEGER,
  pool_total_cents INTEGER,
  total_engagement_score NUMERIC, -- sum of f(read_sec, claps, shares) across all eligible articles
  closed_at       TIMESTAMPTZ,
  status          VARCHAR(20) NOT NULL DEFAULT 'open', -- open | calculating | closed
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS partner_payouts (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  period_id       UUID NOT NULL REFERENCES partner_payout_periods(id) ON DELETE CASCADE,
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  -- Per-user engagement score for the period (same weighting curve as the
  -- pool math). Frozen at distribution time.
  engagement_score NUMERIC NOT NULL,
  read_seconds    INTEGER NOT NULL DEFAULT 0,
  claps           INTEGER NOT NULL DEFAULT 0,
  shares          INTEGER NOT NULL DEFAULT 0,
  user_share_cents INTEGER NOT NULL,
  -- Hold period: 60-day delay before payout becomes eligible (gap #172).
  hold_until      TIMESTAMPTZ,
  -- $50 minimum payout — earnings below the threshold roll forward.
  status          VARCHAR(20) NOT NULL DEFAULT 'pending', -- pending | held_until_threshold | paid | failed
  -- Tremendous order id when the gift card has been pushed.
  tremendous_order_id TEXT,
  paid_at         TIMESTAMPTZ,
  failure_reason  TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_partner_payouts_period_user
  ON partner_payouts(period_id, user_id);

CREATE INDEX IF NOT EXISTS idx_partner_payouts_user_status
  ON partner_payouts(user_id, status);

-- Per-user running balance — accumulates user_share_cents until it crosses
-- the $50 threshold, then rolls into a payable partner_payouts row.
CREATE TABLE IF NOT EXISTS partner_program_balances (
  user_id         UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  pending_cents   INTEGER NOT NULL DEFAULT 0, -- accrued but below $50 threshold
  paid_cents      INTEGER NOT NULL DEFAULT 0, -- lifetime paid
  last_period_id  UUID REFERENCES partner_payout_periods(id) ON DELETE SET NULL,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMIT;
