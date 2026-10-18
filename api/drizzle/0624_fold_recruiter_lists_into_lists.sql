-- W3-D2 item 5 (architecture remediation 2026-10-17): one list engine.
-- recruiter_lists / recruiter_list_members (gap #1360) fold into the
-- polymorphic lists / list_items tables:
--   recruiter_lists.kind 'list'       → lists.kind 'recruiter_list'
--   recruiter_lists.kind 'call_queue' → lists.kind 'call_queue'
--   recruiter_list_members            → list_items entity_type 'talent_pool_candidate'
-- Ids are carried over so /api/recruiter/lists/:id URLs stay valid.
-- Registries: shared/lists.ts. 0625 archives the old tables.

ALTER TABLE lists ADD COLUMN IF NOT EXISTS description text;
ALTER TABLE list_items ADD COLUMN IF NOT EXISTS position integer NOT NULL DEFAULT 0;

-- 'talent_pool_candidate' is 21 chars; entity_type was varchar(16).
DO $$
DECLARE col_type text; max_len integer;
BEGIN
  SELECT data_type, character_maximum_length INTO col_type, max_len
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'list_items' AND column_name = 'entity_type';
  IF col_type = 'character varying' AND max_len < 32 THEN
    ALTER TABLE list_items ALTER COLUMN entity_type TYPE varchar(32);
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public.recruiter_lists') IS NOT NULL THEN
    INSERT INTO lists (id, owner_user_id, company_id, title, description, kind, is_private, created_at, updated_at)
    SELECT r.id, r.recruiter_id, NULL, r.name, r.description,
           CASE WHEN r.kind = 'call_queue' THEN 'call_queue' ELSE 'recruiter_list' END,
           true, r.created_at, r.updated_at
    FROM recruiter_lists r
    ON CONFLICT (id) DO NOTHING;
  END IF;

  IF to_regclass('public.recruiter_list_members') IS NOT NULL THEN
    INSERT INTO list_items (id, list_id, entity_type, entity_id, added_by_user_id, position, added_at)
    SELECT m.id, m.list_id, 'talent_pool_candidate', m.talent_pool_candidate_id, l.owner_user_id, m.position, m.added_at
    FROM recruiter_list_members m
    JOIN lists l ON l.id = m.list_id
    ON CONFLICT DO NOTHING;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'lists_kind_check') THEN
    ALTER TABLE lists
      ADD CONSTRAINT lists_kind_check
      CHECK (kind IN ('custom', 'wishlist', 'recruiter_list', 'call_queue')) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'list_items_entity_type_check') THEN
    ALTER TABLE list_items
      ADD CONSTRAINT list_items_entity_type_check
      CHECK (entity_type IN ('person', 'job', 'resume', 'company', 'pipeline_entry', 'course', 'voice_clone', 'talent_pool_candidate')) NOT VALID;
  END IF;
END $$;
