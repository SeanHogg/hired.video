-- Migration 0214 — SuperAdmin per-role feature & navigation access (gap #2037).
--
-- Per-role overrides for the code-defined Feature Registry
-- (shared/feature-registry.ts). One row per (role, feature_key) that DIFFERS
-- from the registry default; NULL columns inherit the default. An empty table
-- reproduces today's hardcoded behaviour exactly (zero regression), and
-- "reset role to defaults" is just deleting that role's rows.
--
-- This replaces the hardcoded Sidebar `hideForRoles` deny-list (#1995): the
-- resolver (shared/role-access.ts) merges these deltas onto the registry, and
-- every menu/feature gate self-consumes the resulting manifest.
--
-- See shared/role-access.ts for the resolver + wire schema.
-- Idempotent per drizzle/TEMPLATE.md.

CREATE TABLE IF NOT EXISTS role_feature_access (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- USER_ROLES value the override targets.
  role        VARCHAR(50)  NOT NULL,
  -- FeatureRegistryEntry.key, e.g. 'nav:studio'.
  feature_key VARCHAR(200) NOT NULL,
  -- Tri-state overrides — NULL = inherit the registry default for this role.
  visible     BOOLEAN,
  enabled     BOOLEAN,
  rank        INTEGER,
  updated_by  UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- One override row per (role, feature) — the upsert target.
CREATE UNIQUE INDEX IF NOT EXISTS uq_role_feature_access
  ON role_feature_access (role, feature_key);

-- The per-role manifest read loads all of a role's deltas.
CREATE INDEX IF NOT EXISTS idx_role_feature_access_role
  ON role_feature_access (role);

-- ---------------------------------------------------------------------------
-- Seed the ONE net-new streamlined default (PRD §5): the employee back-office.
--
-- affiliate + creator already get their trimmed menu from the registry
-- DEFAULTS (shared/feature-registry.ts encodes the #1995 deny-list as each
-- entry's defaultRoles), so they need NO rows here — the table stays true
-- deltas-only and an empty table reproduces today's behaviour exactly.
--
-- `employee` is invite-only back-office (#1349) and today inherits the full
-- rail (the old deny-list never covered it). Trim the self-promo authoring
-- surfaces it never uses. This is a deliberate, reversible product decision
-- (Reset-to-defaults in /admin/role-access clears it), NOT a regression of the
-- registry mechanism.
--
-- The three primary revenue roles (job_seeker / recruiter / employer) keep the
-- full menu and are curated live by the owner via the admin UI + Preview-as-role.
-- ON CONFLICT DO NOTHING keeps this safe to re-run.
-- ---------------------------------------------------------------------------
INSERT INTO role_feature_access (role, feature_key, visible)
VALUES
  ('employee', 'nav:studio',    false),
  ('employee', 'nav:resumes',   false),
  ('employee', 'nav:companies', false),
  ('employee', 'nav:outreach',  false),
  ('employee', 'nav:gigs',      false)
ON CONFLICT (role, feature_key) DO NOTHING;
