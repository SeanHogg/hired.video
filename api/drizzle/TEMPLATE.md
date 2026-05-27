# Migration Template — Idempotent Patterns

Gap #1625. Every new migration in `api/drizzle/` MUST be safe to re-run
against a partially-applied state. The runner at
[scripts/run-sql-migrations.mjs](../scripts/run-sql-migrations.mjs)
records files in `_sql_migrations` only when ALL statements in the file
succeed. A failed statement leaves the file pending; the runner retries
on the next deploy. Migrations that aren't idempotent break that retry.

## Hard rules

1. **`ALTER COLUMN TYPE` MUST be gated by a `data_type` check.** Once
   converted, the source-type predicate (e.g. regex on a now-uuid
   column) plan-time-fails. Use:
   ```sql
   DO $$
   DECLARE col_type text;
   BEGIN
     SELECT data_type INTO col_type
     FROM information_schema.columns
     WHERE table_name = 'foo' AND column_name = 'bar';
     IF col_type = 'text' THEN
       EXECUTE 'ALTER TABLE foo ALTER COLUMN bar TYPE uuid USING bar::uuid';
     END IF;
   END $$;
   ```

2. **`ADD CONSTRAINT` MUST be gated by `pg_constraint`.** Postgres has
   no `IF NOT EXISTS` for ADD CONSTRAINT.
   ```sql
   DO $$
   BEGIN
     IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'foo_bar_fkey') THEN
       ALTER TABLE foo ADD CONSTRAINT foo_bar_fkey
         FOREIGN KEY (bar) REFERENCES other(id) ON DELETE CASCADE;
     END IF;
   END $$;
   ```

3. **`CREATE INDEX` / `CREATE COLUMN` MUST use `IF NOT EXISTS`.**

4. **`DROP COLUMN` / `DROP CONSTRAINT` MUST use `IF EXISTS`.**

5. **CHECK constraints added to existing tables MUST use `NOT VALID`.**
   Validation happens on new writes only; existing data is untouched
   until an explicit `VALIDATE CONSTRAINT` is run after audit.

6. **For DRY when a logic block repeats across ≥ 3 tables, extract a
   `public.__mig_<NNNN>_<name>` helper function.** Define at the top,
   call N times, `DROP FUNCTION IF EXISTS` at the bottom. **Never use
   `pg_temp`** — the migration runner uses Neon's HTTP driver where
   each statement is a separate connection; `pg_temp` doesn't survive.
   (This rule killed 0146 in CI before #1625 codified it.)

## Canonical patterns

### text → uuid + FK conversion

```sql
CREATE OR REPLACE FUNCTION public.__mig_NNNN_convert_text_user_id(target_table text)
RETURNS void
LANGUAGE plpgsql
AS $func$
DECLARE
  col_type text;
  fk_name  text := target_table || '_user_id_fkey';
BEGIN
  SELECT data_type INTO col_type
  FROM information_schema.columns
  WHERE table_name = target_table AND column_name = 'user_id';

  IF col_type = 'text' THEN
    EXECUTE format(
      'DELETE FROM %I WHERE user_id IS NULL OR user_id !~ %L OR NOT EXISTS (SELECT 1 FROM users WHERE users.id::text = %I.user_id)',
      target_table,
      '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$',
      target_table
    );
    EXECUTE format(
      'ALTER TABLE %I ALTER COLUMN user_id TYPE uuid USING NULLIF(user_id, %L)::uuid',
      target_table, ''
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = fk_name) THEN
    EXECUTE format(
      'ALTER TABLE %I ADD CONSTRAINT %I FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE',
      target_table, fk_name
    );
  END IF;
END;
$func$;

SELECT public.__mig_NNNN_convert_text_user_id('table_a');
SELECT public.__mig_NNNN_convert_text_user_id('table_b');

DROP FUNCTION IF EXISTS public.__mig_NNNN_convert_text_user_id(text);
```

### Adding FK with orphan-clean

```sql
-- Nullable column: NULL out orphans.
UPDATE child SET parent_id = NULL
WHERE parent_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM parent WHERE parent.id = child.parent_id);

-- NOT NULL column: DELETE orphans (lossy — confirm scope first).
DELETE FROM child
WHERE NOT EXISTS (SELECT 1 FROM parent WHERE parent.id = child.parent_id);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'child_parent_id_fkey') THEN
    ALTER TABLE child ADD CONSTRAINT child_parent_id_fkey
      FOREIGN KEY (parent_id) REFERENCES parent(id) ON DELETE SET NULL;
  END IF;
END $$;
```

### Unique index with dedup pre-flight

```sql
WITH ranked AS (
  SELECT id, row_number() OVER (PARTITION BY key_col ORDER BY created_at, id) AS rn
  FROM foo
)
DELETE FROM foo WHERE id IN (SELECT id FROM ranked WHERE rn > 1);

CREATE UNIQUE INDEX IF NOT EXISTS uq_foo_key_col ON foo (key_col);
```

### CHECK constraint (NOT VALID)

```sql
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'foo_status_check') THEN
    ALTER TABLE foo
      ADD CONSTRAINT foo_status_check
      CHECK (status IN ('a', 'b', 'c')) NOT VALID;
  END IF;
END $$;
```

After auditing existing data is clean, promote in a follow-up migration:
```sql
ALTER TABLE foo VALIDATE CONSTRAINT foo_status_check;
```

## Reference migrations

- [0142](./0142_schema_audit_indexes_and_checks.sql) — indexes + NOT VALID CHECKs.
- [0143](./0143_schema_audit_unique_and_idempotency.sql) — dedup + uniqueness.
- [0144](./0144_schema_audit_missing_fks.sql) — orphan-clean + FK adds.
- [0146](./0146_text_userid_to_uuid_and_fks.sql) — DRY helper-function pattern (fixed in pass 7 after the pg_temp CI break).
