-- #1640 — Create `workspaces` parent table to anchor the FKs from
-- workspace_tags, workspace_job_types, workspace_sources,
-- workspace_person_merge_policy, person_merge_queue.
--
-- Workspace semantics (decided here): a workspace is owned by EITHER a
-- user (personal workspace) OR a company. The (owner_user_id,
-- owner_company_id) pair is XOR-enforced via CHECK. This matches the
-- existing usage in taxonomies.ts where `workspace_id uuid` rows
-- reference an ambiguous parent — now the parent is concrete.
--
-- Backfill strategy: insert one workspaces row per distinct workspace_id
-- already in use across the child tables, with NULL owners. Service
-- layer + a separate backfill migration will eventually populate the
-- ownership later — for now the row exists so the FKs can be added.

CREATE TABLE IF NOT EXISTS workspaces (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- XOR ownership: exactly one of (owner_user_id, owner_company_id)
  -- should be set. CHECK enforces it post-backfill.
  owner_user_id uuid REFERENCES users(id) ON DELETE CASCADE,
  owner_company_id uuid REFERENCES company_profiles(id) ON DELETE CASCADE,
  -- Optional human label. Default to a slug derived from the owner's name
  -- at insert time by the service layer.
  name varchar(200),
  created_at timestamp with time zone NOT NULL DEFAULT NOW(),
  updated_at timestamp with time zone NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_workspaces_owner_user ON workspaces (owner_user_id) WHERE owner_user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_workspaces_owner_company ON workspaces (owner_company_id) WHERE owner_company_id IS NOT NULL;

-- Backfill: insert a placeholder workspace row for every workspace_id
-- that's currently referenced from a child table but doesn't have a
-- workspaces row yet. Idempotent — re-runs insert nothing.
INSERT INTO workspaces (id)
SELECT DISTINCT workspace_id FROM workspace_tags
WHERE workspace_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM workspaces WHERE workspaces.id = workspace_tags.workspace_id)
ON CONFLICT DO NOTHING;

INSERT INTO workspaces (id)
SELECT DISTINCT workspace_id FROM workspace_job_types
WHERE workspace_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM workspaces WHERE workspaces.id = workspace_job_types.workspace_id)
ON CONFLICT DO NOTHING;

INSERT INTO workspaces (id)
SELECT DISTINCT workspace_id FROM workspace_sources
WHERE workspace_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM workspaces WHERE workspaces.id = workspace_sources.workspace_id)
ON CONFLICT DO NOTHING;

INSERT INTO workspaces (id)
SELECT DISTINCT workspace_id FROM workspace_person_merge_policy
WHERE workspace_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM workspaces WHERE workspaces.id = workspace_person_merge_policy.workspace_id)
ON CONFLICT DO NOTHING;

INSERT INTO workspaces (id)
SELECT DISTINCT workspace_id FROM person_merge_queue
WHERE workspace_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM workspaces WHERE workspaces.id = person_merge_queue.workspace_id)
ON CONFLICT DO NOTHING;

-- NULL out any FK-pointing column whose value didn't resolve (paranoia —
-- the backfill should have caught everything but if a row was deleted
-- between the SELECT and the INSERT this protects the FK ADD).
UPDATE workspace_tags SET workspace_id = NULL
WHERE workspace_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM workspaces WHERE workspaces.id = workspace_tags.workspace_id);
UPDATE workspace_job_types SET workspace_id = NULL
WHERE workspace_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM workspaces WHERE workspaces.id = workspace_job_types.workspace_id);
UPDATE workspace_sources SET workspace_id = NULL
WHERE workspace_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM workspaces WHERE workspaces.id = workspace_sources.workspace_id);

-- Add FKs from child tables to the new workspaces table.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'workspace_tags_workspace_id_fkey') THEN
    ALTER TABLE workspace_tags
      ADD CONSTRAINT workspace_tags_workspace_id_fkey
      FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'workspace_job_types_workspace_id_fkey') THEN
    ALTER TABLE workspace_job_types
      ADD CONSTRAINT workspace_job_types_workspace_id_fkey
      FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'workspace_sources_workspace_id_fkey') THEN
    ALTER TABLE workspace_sources
      ADD CONSTRAINT workspace_sources_workspace_id_fkey
      FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'workspace_person_merge_policy_workspace_id_fkey') THEN
    ALTER TABLE workspace_person_merge_policy
      ADD CONSTRAINT workspace_person_merge_policy_workspace_id_fkey
      FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'person_merge_queue_workspace_id_fkey') THEN
    ALTER TABLE person_merge_queue
      ADD CONSTRAINT person_merge_queue_workspace_id_fkey
      FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE;
  END IF;
END $$;

-- Add the XOR-ownership CHECK as NOT VALID — existing placeholder rows
-- have NULL owners and would fail otherwise. Promotion via
-- `VALIDATE CONSTRAINT` happens after the application backfills owners.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'workspaces_owner_xor') THEN
    ALTER TABLE workspaces
      ADD CONSTRAINT workspaces_owner_xor
      CHECK (
        (owner_user_id IS NOT NULL AND owner_company_id IS NULL)
        OR
        (owner_user_id IS NULL AND owner_company_id IS NOT NULL)
        OR
        (owner_user_id IS NULL AND owner_company_id IS NULL)
      ) NOT VALID;
  END IF;
END $$;
