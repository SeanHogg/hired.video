-- Migration 0122c — Reclaim `job_items` dropped-column slots PROPERLY.
--
-- File-ordering note: named `0122c_` (not `0123x_` or `0125b_`) so the
-- runner's filename sort places it BETWEEN the 0122 batch and 0123
-- batch. If it sorted AFTER the 0123 ADD COLUMN files, those would
-- error first on a fresh-deploy run, never get recorded, and keep
-- replaying every deploy until the rebuild finally landed.
--
-- Why this exists
-- ---------------
-- Migration 0122_reclaim_job_items_columns.sql tried `VACUUM FULL` to
-- reclaim the 1568 dropped column slots that `job_items` had
-- accumulated. That was based on a wrong premise: VACUUM FULL rewrites
-- the heap but does NOT remove rows from `pg_attribute` where
-- `attisdropped = true`. Those rows are what count against PostgreSQL's
-- 1600-column hard cap, so after the VACUUM the cap still bites and
-- 0123_job_items_archived_at.sql + 0123_placement_splits_subs_share_perms_merge.sql
-- both keep failing with "tables can have at most 1600 columns" when
-- they try to add `archived_at` and `share_permissions`.
--
-- The only PostgreSQL-supported way to actually drop those slots is a
-- logical table rewrite: create a new table from the live column list,
-- copy rows, drop the original, rename. This migration does exactly
-- that, inside a single DO block so the FK drop/rebuild and the
-- create/swap all roll back together if any statement errors.
--
-- The new table is materialised with `archived_at` + `share_permissions`
-- already in place — the two 0123 ADD COLUMN files re-run on the next
-- deploy and their IF NOT EXISTS guards no-op against the rebuilt
-- table, letting both files get recorded as applied.
--
-- Idempotency
-- -----------
-- Wraps the rewrite in a "is the table actually bloated?" guard so a
-- replay (e.g. on a different environment that's already clean) is a
-- no-op. The threshold (100 dropped columns) is well below the broken
-- state (1568) and well above any normal column churn.

DO $$
DECLARE
  dropped_count int;
  fk_defs       text[];
  fk_def        text;
  drop_stmt     text;
BEGIN
  SELECT COUNT(*) INTO dropped_count
  FROM pg_attribute
  WHERE attrelid = 'public.job_items'::regclass
    AND attisdropped;

  IF dropped_count < 100 THEN
    RAISE NOTICE 'job_items has % dropped slots — rewrite skipped', dropped_count;
    RETURN;
  END IF;

  -- 1. Snapshot every FK constraint on other tables that points at
  --    job_items.id. `pg_get_constraintdef` returns the full clause
  --    (`FOREIGN KEY (...) REFERENCES job_items(id) ON DELETE ...`)
  --    which we wrap in an ALTER TABLE ADD CONSTRAINT for replay.
  SELECT array_agg(
    format('ALTER TABLE %I.%I ADD CONSTRAINT %I %s',
           ns.nspname, cl.relname, con.conname, pg_get_constraintdef(con.oid))
  )
  INTO fk_defs
  FROM pg_constraint con
  JOIN pg_class cl ON cl.oid = con.conrelid
  JOIN pg_namespace ns ON ns.oid = cl.relnamespace
  WHERE con.contype = 'f'
    AND con.confrelid = 'public.job_items'::regclass;

  -- 2. Drop the FKs (DROP TABLE job_items would otherwise fail with
  --    "cannot drop … because other objects depend on it").
  FOR drop_stmt IN
    SELECT format('ALTER TABLE %I.%I DROP CONSTRAINT %I',
                  ns.nspname, cl.relname, con.conname)
    FROM pg_constraint con
    JOIN pg_class cl ON cl.oid = con.conrelid
    JOIN pg_namespace ns ON ns.oid = cl.relnamespace
    WHERE con.contype = 'f'
      AND con.confrelid = 'public.job_items'::regclass
  LOOP
    EXECUTE drop_stmt;
  END LOOP;

  -- 3. Create the clean replacement. Schema matches schema/jobs.ts and
  --    pre-applies the two 0123 ADD COLUMN files so the bloated table
  --    isn't recreated only to be ALTERed again.
  CREATE TABLE public.job_items_new (
    id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    posted_by_user_id         uuid REFERENCES public.users(id) ON DELETE SET NULL,
    company_id                uuid,
    title                     varchar(255) NOT NULL,
    description               text NOT NULL DEFAULT '',
    company                   varchar(255),
    location                  varchar(255),
    job_type                  varchar(50),
    experience_level          varchar(50),
    salary_min                numeric,
    salary_max                numeric,
    salary_currency           varchar(10) DEFAULT 'USD',
    skills_required           jsonb DEFAULT '[]'::jsonb,
    sector                    varchar(64),
    details                   jsonb DEFAULT '{}'::jsonb,
    is_remote                 boolean NOT NULL DEFAULT false,
    is_active                 boolean NOT NULL DEFAULT true,
    expires_at                timestamptz,
    sponsored                 boolean NOT NULL DEFAULT false,
    sponsored_until           timestamptz,
    sponsored_rank_boost      integer NOT NULL DEFAULT 0,
    source_url                text,
    apply_url                 text,
    hero_image_url            text,
    sentiment_score           integer,
    body_cleansed_at          timestamptz,
    body_cleanse_status       varchar(16),
    screening_question_set_id uuid,
    screening_required        varchar(16) NOT NULL DEFAULT 'none'
      CHECK (screening_required IN ('none', 'optional', 'required')),
    source_id                 uuid,
    archived_at               timestamptz,
    share_permissions         jsonb,
    created_at                timestamptz NOT NULL DEFAULT now(),
    updated_at                timestamptz NOT NULL DEFAULT now()
  );

  -- 4. Copy data. Explicit column lists on both sides so any future
  --    column addition can't silently misalign positionally.
  INSERT INTO public.job_items_new (
    id, posted_by_user_id, company_id, title, description, company, location,
    job_type, experience_level, salary_min, salary_max, salary_currency,
    skills_required, sector, details, is_remote, is_active, expires_at,
    sponsored, sponsored_until, sponsored_rank_boost, source_url, apply_url,
    hero_image_url, sentiment_score, body_cleansed_at, body_cleanse_status,
    screening_question_set_id, screening_required, source_id,
    created_at, updated_at
  )
  SELECT
    id, posted_by_user_id, company_id, title, description, company, location,
    job_type, experience_level, salary_min, salary_max, salary_currency,
    skills_required, sector, details, is_remote, is_active, expires_at,
    sponsored, sponsored_until, sponsored_rank_boost, source_url, apply_url,
    hero_image_url, sentiment_score, body_cleansed_at, body_cleanse_status,
    screening_question_set_id, screening_required, source_id,
    created_at, updated_at
  FROM public.job_items;

  -- 5. Swap.
  DROP TABLE public.job_items;
  ALTER TABLE public.job_items_new RENAME TO job_items;

  -- 6. Recreate the indexes previous migrations created. The PK index
  --    comes for free from the column-level PRIMARY KEY.
  CREATE INDEX idx_job_items_company
    ON public.job_items (company_id);
  CREATE INDEX idx_job_items_screening_set
    ON public.job_items (screening_question_set_id)
    WHERE screening_question_set_id IS NOT NULL;
  CREATE INDEX idx_job_items_sector_active
    ON public.job_items (sector, is_active, created_at DESC)
    WHERE sector IS NOT NULL;
  CREATE INDEX idx_job_items_source_id
    ON public.job_items (source_id);
  CREATE INDEX job_items_cleanse_pending_idx
    ON public.job_items (body_cleansed_at NULLS FIRST, updated_at)
    WHERE body_cleansed_at IS NULL OR body_cleansed_at < updated_at;
  -- The 0123 archived_at partial index (0123 will also try to create it
  -- but its IF NOT EXISTS guard makes the replay a no-op).
  CREATE INDEX idx_job_items_archived_at_null
    ON public.job_items (is_active)
    WHERE archived_at IS NULL;

  -- 7. Recreate the FKs from the snapshot.
  IF fk_defs IS NOT NULL THEN
    FOREACH fk_def IN ARRAY fk_defs LOOP
      EXECUTE fk_def;
    END LOOP;
  END IF;
END $$;
