-- Migration 0185 — People Operations (CHRO) foundation.
--
-- Stands up the embeddable, multi-tenant CHRO employer product per
-- specs/hired-video. Implements the Tenant→Segment→Entity isolation model
-- (doc 01) and the phase-1 vertical slice: the Employee spine (PO-1),
-- 1:1 sessions (PO-2), and the canonical ActionItem.
--
-- Every business row carries (tenant_id, segment_id); no query runs
-- without that scope (enforced in the repository layer). The native
-- hired.video product is seeded as the `self` tenant; a native employer
-- maps to one segment per company.
--
-- Idempotent per drizzle/TEMPLATE.md — CREATE … IF NOT EXISTS, inline
-- CHECKs on the new tables, gated index creation, ON CONFLICT seed.

-- ── Tenancy ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS people_tenants (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug        VARCHAR(64) NOT NULL UNIQUE,
  name        VARCHAR(255) NOT NULL,
  kind        VARCHAR(16) NOT NULL DEFAULT 'self'
                CHECK (kind IN ('self', 'embedded', 'direct')),
  idp_issuer  VARCHAR(255),
  status      VARCHAR(16) NOT NULL DEFAULT 'active'
                CHECK (status IN ('active', 'suspended')),
  settings    JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS people_segments (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           UUID NOT NULL REFERENCES people_tenants(id) ON DELETE CASCADE,
  company_id          UUID REFERENCES company_profiles(id) ON DELETE SET NULL,
  external_account_id VARCHAR(128) NOT NULL,
  external_company_id VARCHAR(128) NOT NULL,
  display_name        VARCHAR(255) NOT NULL,
  plan                VARCHAR(32) NOT NULL DEFAULT 'free',
  status              VARCHAR(16) NOT NULL DEFAULT 'active'
                        CHECK (status IN ('active', 'suspended', 'archived')),
  settings            JSONB NOT NULL DEFAULT '{}'::jsonb,
  provisioned_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_active_at      TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_people_segments_identity
  ON people_segments (tenant_id, external_account_id, external_company_id);
CREATE INDEX IF NOT EXISTS idx_people_segments_company
  ON people_segments (company_id);
CREATE INDEX IF NOT EXISTS idx_people_segments_tenant_status
  ON people_segments (tenant_id, status);

-- ── Employee spine (roster) ───────────────────────────────────────────────────
-- The roster is a SUPERSET of billable seats. Each row carries ONE identity
-- link (or none = placeholder); billability is derived in the service layer and
-- never bumps seats here:
--   user_id         → native hired.video login (the billable path)
--   invitation_id   → pending native account invitation
--   external_user_id→ federated identity in the CONSUMING product (embedded
--                     tenant) — visible per-segment, NEVER billable
--   (all null)      → placeholder the employer tracks but never invites
-- first_name/last_name/email/avatar are a denormalized DISPLAY CACHE.
CREATE TABLE IF NOT EXISTS people_employees (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                   UUID NOT NULL REFERENCES people_tenants(id) ON DELETE CASCADE,
  segment_id                  UUID NOT NULL REFERENCES people_segments(id) ON DELETE CASCADE,
  user_id                     UUID REFERENCES users(id) ON DELETE SET NULL,
  invitation_id               UUID REFERENCES account_invitations(id) ON DELETE SET NULL,
  external_user_id            VARCHAR(255),
  first_name                  VARCHAR(120) NOT NULL,
  last_name                   VARCHAR(120) NOT NULL,
  email                       VARCHAR(320),
  phone                       VARCHAR(40),
  position                    VARCHAR(200) NOT NULL DEFAULT '',
  department                  VARCHAR(120) NOT NULL DEFAULT '',
  location                    VARCHAR(200),
  start_date                  TIMESTAMPTZ,
  employment_type             VARCHAR(32) NOT NULL DEFAULT 'full-time',
  status                      VARCHAR(16) NOT NULL DEFAULT 'active'
                                CHECK (status IN ('active', 'inactive', 'on_leave', 'terminated')),
  avatar                      TEXT,
  skills                      JSONB NOT NULL DEFAULT '[]'::jsonb,
  notes                       TEXT,
  manager_id                  UUID REFERENCES people_employees(id) ON DELETE SET NULL,
  performance_rating          DOUBLE PRECISION,
  salary_cents                BIGINT CHECK (salary_cents IS NULL OR salary_cents >= 0),
  equity_shares               INTEGER CHECK (equity_shares IS NULL OR equity_shares >= 0),
  is_founder                  BOOLEAN NOT NULL DEFAULT false,
  converted_from_candidate_id UUID,
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- One roster row per native user / per federated identity / per email within a
-- segment; partial so multiple null-identity placeholders can coexist.
CREATE UNIQUE INDEX IF NOT EXISTS uq_people_employees_segment_user
  ON people_employees (tenant_id, segment_id, user_id) WHERE user_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_people_employees_segment_external
  ON people_employees (tenant_id, segment_id, external_user_id) WHERE external_user_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_people_employees_segment_email
  ON people_employees (tenant_id, segment_id, email) WHERE email IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_people_employees_status
  ON people_employees (tenant_id, segment_id, status);
CREATE INDEX IF NOT EXISTS idx_people_employees_manager
  ON people_employees (tenant_id, segment_id, manager_id);

-- ── 1-on-1 sessions ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS people_one_on_ones (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES people_tenants(id) ON DELETE CASCADE,
  segment_id      UUID NOT NULL REFERENCES people_segments(id) ON DELETE CASCADE,
  supervisor_id   UUID NOT NULL REFERENCES people_employees(id) ON DELETE CASCADE,
  participant_id  UUID NOT NULL REFERENCES people_employees(id) ON DELETE CASCADE,
  scheduled_date  TIMESTAMPTZ NOT NULL,
  duration        INTEGER NOT NULL DEFAULT 60,
  status          VARCHAR(16) NOT NULL DEFAULT 'scheduled'
                    CHECK (status IN ('scheduled', 'completed', 'cancelled', 'rescheduled')),
  meeting_type    VARCHAR(16) NOT NULL DEFAULT 'video'
                    CHECK (meeting_type IN ('video', 'phone', 'in_person', 'hybrid')),
  location        VARCHAR(200),
  meeting_link    TEXT,
  agenda          JSONB NOT NULL DEFAULT '[]'::jsonb,
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_people_one_on_ones_supervisor
  ON people_one_on_ones (tenant_id, segment_id, supervisor_id);
CREATE INDEX IF NOT EXISTS idx_people_one_on_ones_participant
  ON people_one_on_ones (tenant_id, segment_id, participant_id);
CREATE INDEX IF NOT EXISTS idx_people_one_on_ones_date
  ON people_one_on_ones (tenant_id, segment_id, scheduled_date);

-- NOTE: the canonical cross-source ActionItem is NOT created here — it reuses
-- the existing `tasks` table, extended with segment scoping in migration 0186.

-- ── Seed the native self-tenant ────────────────────────────────────────────────
-- The native hired.video product is one tenant; native employers each get a
-- segment under it (lazy-created by resolveSegment on first request).
INSERT INTO people_tenants (slug, name, kind, status)
VALUES ('hired-video', 'hired.video', 'self', 'active')
ON CONFLICT (slug) DO NOTHING;
