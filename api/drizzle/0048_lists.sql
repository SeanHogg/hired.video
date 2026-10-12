-- Migration: generic Lists feature — polymorphic bookmarks across People,
-- Jobs, Resumes, and Companies. See api/src/db/schema/lists.ts.

CREATE TABLE IF NOT EXISTS lists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  -- Null = personal list (owner-only). Set = scoped to a company; visibility
  -- depends on is_private.
  company_id UUID REFERENCES company_profiles(id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  is_private BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS lists_owner_idx ON lists(owner_user_id);
CREATE INDEX IF NOT EXISTS lists_company_idx ON lists(company_id);

CREATE TABLE IF NOT EXISTS list_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  list_id UUID NOT NULL REFERENCES lists(id) ON DELETE CASCADE,
  -- Polymorphic — one of: person | job | resume | company.
  -- entity_id is NOT a foreign key (can't FK across union); routes validate.
  entity_type VARCHAR(16) NOT NULL,
  entity_id UUID NOT NULL,
  added_by_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  notes TEXT,
  added_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Prevent duplicate adds within a list
CREATE UNIQUE INDEX IF NOT EXISTS list_items_unique_idx
  ON list_items(list_id, entity_type, entity_id);

-- "What lists is this entity in?" lookup
CREATE INDEX IF NOT EXISTS list_items_entity_idx
  ON list_items(entity_type, entity_id);

-- Pagination over a list
CREATE INDEX IF NOT EXISTS list_items_list_idx
  ON list_items(list_id);
