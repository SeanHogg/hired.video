-- Migration 0121 — Recruiter taxonomies + Archive flow + Resume Versions +
-- Sourcing filters + Placement Type + Resume Forwarding Address.
--
-- Bundle is intentional: every entry below is a small, isolated schema
-- addition that landed together as one ROI pass against the Consolidated
-- Gap Register (#231, #232, #238, #226, #154, #155, #220, #221, #251).
-- Each block is annotated with its gap id so future maintainers can
-- bisect a single feature without untangling the others.
--
-- ─── #231 — Three-axis workspace Tags taxonomy ────────────────────────
-- One bounded vocabulary per axis (Company / Job / Person), shared across
-- the workspace. Polymorphic `tag_assignments` so the SAME tag row can be
-- attached to any axis-matched entity.
CREATE TABLE IF NOT EXISTS "workspace_tags" (
  "id"          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "workspace_id" uuid,
  -- 'company' | 'job' | 'person'. Kept as varchar (not CHECK) to dodge
  -- the migration-drift bug pattern that bit media_kind in #963.
  "axis"        varchar(16) NOT NULL,
  "name"        varchar(64) NOT NULL,
  "color_hex"   varchar(7)  NOT NULL DEFAULT '#94a3b8',
  "order_index" integer     NOT NULL DEFAULT 0,
  "is_built_in" boolean     NOT NULL DEFAULT false,
  "created_at"  timestamptz NOT NULL DEFAULT now(),
  "updated_at"  timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "uq_workspace_tags_workspace_axis_name"
  ON "workspace_tags" ("workspace_id", "axis", lower("name"));
CREATE INDEX IF NOT EXISTS "idx_workspace_tags_axis_order"
  ON "workspace_tags" ("axis", "order_index");

CREATE TABLE IF NOT EXISTS "tag_assignments" (
  "id"        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tag_id"    uuid NOT NULL REFERENCES "workspace_tags" ("id") ON DELETE CASCADE,
  -- Same axis as the tag — denormalised so we can index without joining.
  "axis"      varchar(16) NOT NULL,
  "entity_id" uuid NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "uq_tag_assignments_tag_entity"
  ON "tag_assignments" ("tag_id", "entity_id");
CREATE INDEX IF NOT EXISTS "idx_tag_assignments_axis_entity"
  ON "tag_assignments" ("axis", "entity_id");

-- Seed 25 default industry tags on the Job axis (built-in, workspace-null
-- so they show up for every workspace). Color palette is the existing
-- Tailwind slate / blue / emerald / amber / rose family used elsewhere.
INSERT INTO "workspace_tags" ("axis", "name", "color_hex", "order_index", "is_built_in") VALUES
  ('job', 'Engineering',          '#2563eb',  1, true),
  ('job', 'Data & ML',             '#7c3aed',  2, true),
  ('job', 'Product',               '#0ea5e9',  3, true),
  ('job', 'Design',                '#db2777',  4, true),
  ('job', 'Marketing',             '#f97316',  5, true),
  ('job', 'Sales',                 '#10b981',  6, true),
  ('job', 'Customer Success',      '#14b8a6',  7, true),
  ('job', 'Operations',            '#64748b',  8, true),
  ('job', 'Finance',               '#0f766e',  9, true),
  ('job', 'Legal',                 '#7c2d12', 10, true),
  ('job', 'Healthcare',            '#dc2626', 11, true),
  ('job', 'Education',             '#9333ea', 12, true),
  ('job', 'Government',            '#1d4ed8', 13, true),
  ('job', 'Skilled Trades',        '#a16207', 14, true),
  ('job', 'Security',              '#475569', 15, true),
  ('job', 'Manufacturing',         '#854d0e', 16, true),
  ('job', 'Construction',          '#a16207', 17, true),
  ('job', 'Real Estate',           '#059669', 18, true),
  ('job', 'Hospitality',           '#e11d48', 19, true),
  ('job', 'Beauty & Wellness',     '#f472b6', 20, true),
  ('job', 'Logistics',             '#0284c7', 21, true),
  ('job', 'Non-profit',            '#16a34a', 22, true),
  ('job', 'Politics & Campaigns',  '#9333ea', 23, true),
  ('job', 'Civic / Public Service','#0369a1', 24, true),
  ('job', 'Gig / Contract',        '#737373', 25, true)
ON CONFLICT DO NOTHING;

-- ─── #232 — Workspace Job Types taxonomy with financial defaults ──────
-- Replaces the free-text `job_type` string on job_items with a typed
-- reference to a taxonomy row that carries the bill / pay / overtime /
-- fee defaults the commission engine + invoice templates need (#262).
CREATE TABLE IF NOT EXISTS "workspace_job_types" (
  "id"                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "workspace_id"             uuid,
  "slug"                     varchar(48) NOT NULL,
  "label"                    varchar(96) NOT NULL,
  -- Optional financial defaults, all in minor units (cents) and bps. NULL
  -- means "no default" — the placement editor surfaces a blank field.
  "default_bill_rate_cents"  bigint,
  "default_pay_rate_cents"   bigint,
  "default_overtime_multiplier_bps" integer,
  "default_fee_bps"          integer,
  -- 'yearly' | 'hourly' — drives whether the placement editor renders
  -- bill/pay as $/yr or $/hr.
  "rate_basis"               varchar(8) NOT NULL DEFAULT 'yearly',
  "is_built_in"              boolean NOT NULL DEFAULT false,
  "order_index"              integer NOT NULL DEFAULT 0,
  "created_at"               timestamptz NOT NULL DEFAULT now(),
  "updated_at"               timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "uq_workspace_job_types_workspace_slug"
  ON "workspace_job_types" ("workspace_id", "slug");

INSERT INTO "workspace_job_types" ("slug", "label", "rate_basis", "default_overtime_multiplier_bps", "default_fee_bps", "is_built_in", "order_index") VALUES
  ('ft-yearly',     'Full-Time (Yearly)',   'yearly', NULL,  2000, true, 1),
  ('contract-hourly','Contract (Hourly)',   'hourly', 15000, 0,    true, 2),
  ('c2h-hourly',    'Contract-to-Hire',     'hourly', 15000, 1500, true, 3),
  ('part-time',     'Part-Time',            'hourly', NULL,  0,    true, 4),
  ('internship',    'Internship',           'hourly', NULL,  0,    true, 5)
ON CONFLICT DO NOTHING;

-- ─── #238 — Workspace Sources taxonomy (origin attribution) ───────────
-- Replaces ad-hoc `source` strings on talent_pool_candidates + job_items
-- with a typed FK to a small workspace-scoped vocabulary.
CREATE TABLE IF NOT EXISTS "workspace_sources" (
  "id"           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "workspace_id" uuid,
  "slug"         varchar(48) NOT NULL,
  "label"        varchar(96) NOT NULL,
  "is_built_in"  boolean     NOT NULL DEFAULT false,
  "order_index"  integer     NOT NULL DEFAULT 0,
  "created_at"   timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "uq_workspace_sources_workspace_slug"
  ON "workspace_sources" ("workspace_id", "slug");

INSERT INTO "workspace_sources" ("slug", "label", "is_built_in", "order_index") VALUES
  ('inbound',   'Inbound',    true, 1),
  ('referral',  'Referral',   true, 2),
  ('sourced',   'Sourced',    true, 3),
  ('job-board', 'Job Board',  true, 4),
  ('event',     'Event',      true, 5),
  ('other',     'Other',      true, 6)
ON CONFLICT DO NOTHING;

ALTER TABLE "talent_pool_candidates"
  ADD COLUMN IF NOT EXISTS "source_id" uuid;
ALTER TABLE "job_items"
  ADD COLUMN IF NOT EXISTS "source_id" uuid;
CREATE INDEX IF NOT EXISTS "idx_talent_pool_candidates_source_id"
  ON "talent_pool_candidates" ("source_id");
CREATE INDEX IF NOT EXISTS "idx_job_items_source_id"
  ON "job_items" ("source_id");

-- ─── #226 — Placement Type field on placements (FK → workspace_job_types)
ALTER TABLE "placements"
  ADD COLUMN IF NOT EXISTS "placement_type_id" uuid;
CREATE INDEX IF NOT EXISTS "idx_placements_placement_type_id"
  ON "placements" ("placement_type_id");

-- ─── #154 — Archive / Unarchive flow ──────────────────────────────────
-- The `status` enum on resumes / jobs already supports `archived` but no
-- timestamp column tracks WHEN. Add `archived_at` so the default list
-- can filter `archived_at IS NULL` and "Include archived" toggles flip
-- it back.
ALTER TABLE "resume_information"
  ADD COLUMN IF NOT EXISTS "archived_at" timestamptz;
CREATE INDEX IF NOT EXISTS "idx_resume_information_archived_at_null"
  ON "resume_information" ("user_id")
  WHERE "archived_at" IS NULL;

ALTER TABLE "job_items"
  ADD COLUMN IF NOT EXISTS "archived_at" timestamptz;
CREATE INDEX IF NOT EXISTS "idx_job_items_archived_at_null"
  ON "job_items" ("is_active")
  WHERE "archived_at" IS NULL;

-- ─── #155 — Resume Version History (mirrors studio_project_versions) ──
CREATE TABLE IF NOT EXISTS "resume_versions" (
  "id"            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "resume_id"     uuid NOT NULL,
  "user_id"       uuid NOT NULL,
  "version_number" integer NOT NULL,
  "label"         varchar(120),
  "resume_data"   jsonb NOT NULL,
  "is_autosave"   boolean NOT NULL DEFAULT false,
  "created_at"    timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "uq_resume_versions_resume_version"
  ON "resume_versions" ("resume_id", "version_number");
CREATE INDEX IF NOT EXISTS "idx_resume_versions_resume_created"
  ON "resume_versions" ("resume_id", "created_at" DESC);

-- ─── #220 + #221 — Sourcing filter columns on sourced_person_refs ─────
-- Schema additions to consumer-side `sourced_person_refs` (snapshot
-- fields, indexed) feeding the Source rail filters. Diversity values
-- are consent-gated and fed by Diversity taxonomy (#236, not in this
-- migration). All columns are nullable so legacy refs survive.
-- The `sourced_person_refs` table itself is provisioned by a separate
-- contact-sourcing migration; we add the columns conditionally so this
-- migration can land even when sourcing isn't deployed yet.
DO $$ BEGIN
  IF EXISTS (
    SELECT FROM information_schema.tables WHERE table_name = 'sourced_person_refs'
  ) THEN
    EXECUTE 'ALTER TABLE sourced_person_refs
               ADD COLUMN IF NOT EXISTS diversity_self_id varchar(48),
               ADD COLUMN IF NOT EXISTS security_clearance varchar(48),
               ADD COLUMN IF NOT EXISTS tenure_months integer,
               ADD COLUMN IF NOT EXISTS company_ranking integer,
               ADD COLUMN IF NOT EXISTS company_size_bucket varchar(24),
               ADD COLUMN IF NOT EXISTS timezone varchar(48)';
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_sourced_person_refs_clearance ON sourced_person_refs (security_clearance) WHERE security_clearance IS NOT NULL';
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_sourced_person_refs_tenure ON sourced_person_refs (tenure_months) WHERE tenure_months IS NOT NULL';
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_sourced_person_refs_timezone ON sourced_person_refs (timezone) WHERE timezone IS NOT NULL';
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_sourced_person_refs_company_size ON sourced_person_refs (company_size_bucket) WHERE company_size_bucket IS NOT NULL';
  END IF;
END $$;

-- ─── #251 — Resume Forwarding Address slug ────────────────────────────
-- Per-recruiter inbound email address slug. The Mailgun-style inbound
-- handler routes `{slug}@resume-forward.hired.video` to the matching
-- recruiter and parses any attached resume.
ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "resume_forwarding_slug" varchar(48);
CREATE UNIQUE INDEX IF NOT EXISTS "uq_users_resume_forwarding_slug"
  ON "users" (lower("resume_forwarding_slug"))
  WHERE "resume_forwarding_slug" IS NOT NULL;
