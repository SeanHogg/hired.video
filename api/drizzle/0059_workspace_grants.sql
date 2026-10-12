-- Workspace Grants Migration
--
-- Generalises "X may act on behalf of Y" beyond the existing company
-- membership model in user_company_role_associations.
--
-- Use cases this enables:
--   * Video editor / coach hired by a job seeker to record + edit videos
--     on the seeker's behalf. The editor is granted on the seeker's
--     personal workspace; finished videos still belong to the seeker.
--   * Contractor working on multiple companies' video pipelines who
--     should not be a permanent company employee — covered today by
--     user_company_role_associations with role='contractor', no schema
--     change needed there.
--
-- Together these two tables answer the universal question
-- "may :actor write on behalf of :owner?" for every studio surface:
--
--   actor === owner.user_id                                 -> yes (self)
--   owner.company_id IS NOT NULL AND
--     active row in user_company_role_associations          -> yes (member)
--   owner.user_id IS NOT NULL AND
--     active row in workspace_grants matching subject       -> yes (delegate)
--
-- This is enforced in services/studio/workspace.ts canActFor() — the
-- single source of truth that every studio mutation routes through.

CREATE TABLE IF NOT EXISTS workspace_grants (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  contributor_user_id   UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role                  TEXT NOT NULL DEFAULT 'editor',
  scope                 TEXT NOT NULL DEFAULT 'studio',
  is_active             BOOLEAN NOT NULL DEFAULT true,
  granted_by_user_id    UUID REFERENCES users(id) ON DELETE SET NULL,
  granted_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at            TIMESTAMPTZ,
  revoked_at            TIMESTAMPTZ,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_workspace_grants_subject ON workspace_grants(subject_user_id);

CREATE INDEX IF NOT EXISTS idx_workspace_grants_contributor ON workspace_grants(contributor_user_id);

CREATE UNIQUE INDEX IF NOT EXISTS uq_workspace_grants_active ON workspace_grants(subject_user_id, contributor_user_id, scope) WHERE is_active = true;
