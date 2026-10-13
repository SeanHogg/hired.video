-- Migration 0533 — guest adoption keeps the guest's connections (2026-10-12).
--
-- Two defects in 0496's adopt_guest_user lost the networks a visitor
-- connected as a guest the moment they signed in:
--
--   1. A collision kept the REAL user's row. For a social connection that is
--      backwards: the guest's row is the one the visitor just made (a fresh
--      token); the account's is older and may be expired or revoked.
--   2. A collision anywhere in a table rolled back the WHOLE table's UPDATE
--      and then deleted EVERY guest row in it — one colliding LinkedIn row
--      also wiped the guest's TikTok, X, … connections.
--
-- Fix: (1) the guest's connection replaces the account's for the same
-- network (social_connections: platform + workspace; youtube_accounts: the
-- same Google identity), removed before the move; (2) a table whose bulk
-- move collides falls back to row by row, dropping only the rows that
-- actually collide (1:1 tables such as profiles keep the real user's row).
--
-- 0496 is applied and stays untouched (the runner tracks files by name);
-- this replaces the function. Idempotent: CREATE OR REPLACE.

CREATE OR REPLACE FUNCTION adopt_guest_user(p_guest uuid, p_target uuid)
RETURNS integer
LANGUAGE plpgsql
AS $fn$
DECLARE
  r record;
  rr record;
  n integer;
  moved integer := 0;
BEGIN
  IF p_guest = p_target THEN
    RETURN 0;
  END IF;

  PERFORM 1 FROM users WHERE id = p_guest AND is_guest FOR UPDATE;
  IF NOT FOUND THEN
    RETURN -1;
  END IF;

  -- The guest's sessions die with it (its JWTs stop validating).
  DELETE FROM sessions WHERE user_id = p_guest;

  -- The visitor's fresh connections win over the account's older ones.
  DELETE FROM social_connections acct
   USING social_connections g
   WHERE g.user_id = p_guest
     AND acct.user_id = p_target
     AND acct.platform = g.platform
     AND COALESCE(acct.company_id, '00000000-0000-0000-0000-000000000000'::uuid)
       = COALESCE(g.company_id, '00000000-0000-0000-0000-000000000000'::uuid);

  DELETE FROM youtube_accounts acct
   USING youtube_accounts g
   WHERE g.user_id = p_guest
     AND acct.user_id = p_target
     AND acct.google_id = g.google_id;

  FOR r IN
    SELECT ns.nspname AS sch, cl.relname AS tbl, att.attname AS col
      FROM pg_constraint con
      JOIN pg_class cl ON cl.oid = con.conrelid
      JOIN pg_namespace ns ON ns.oid = cl.relnamespace
      JOIN pg_attribute att ON att.attrelid = con.conrelid AND att.attnum = con.conkey[1]
     WHERE con.contype = 'f'
       AND con.confrelid = 'public.users'::regclass
       AND array_length(con.conkey, 1) = 1
       AND cl.relname <> 'users'
    UNION
    SELECT c.table_schema, c.table_name, c.column_name
      FROM information_schema.columns c
      JOIN information_schema.tables t
        ON t.table_schema = c.table_schema AND t.table_name = c.table_name
     WHERE c.table_schema = 'public'
       AND t.table_type = 'BASE TABLE'
       AND c.column_name = 'user_id'
       AND c.data_type IN ('text', 'character varying')
  LOOP
    BEGIN
      EXECUTE format('UPDATE %I.%I SET %I = $1 WHERE %I::text = $2', r.sch, r.tbl, r.col, r.col)
        USING p_target, p_guest::text;
      GET DIAGNOSTICS n = ROW_COUNT;
      moved := moved + n;
    EXCEPTION
      WHEN unique_violation OR exclusion_violation OR check_violation THEN
        -- Row by row: only a row that collides is dropped (the real
        -- user's row stays); every other guest row still moves.
        FOR rr IN EXECUTE format('SELECT ctid FROM %I.%I WHERE %I::text = $1', r.sch, r.tbl, r.col)
          USING p_guest::text
        LOOP
          BEGIN
            EXECUTE format('UPDATE %I.%I SET %I = $1 WHERE ctid = $2', r.sch, r.tbl, r.col)
              USING p_target, rr.ctid;
            moved := moved + 1;
          EXCEPTION
            WHEN unique_violation OR exclusion_violation OR check_violation THEN
              EXECUTE format('DELETE FROM %I.%I WHERE ctid = $1', r.sch, r.tbl)
                USING rr.ctid;
          END;
        END LOOP;
    END;
  END LOOP;

  DELETE FROM users WHERE id = p_guest;
  RETURN moved;
END;
$fn$;
