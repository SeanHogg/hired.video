-- Migration 0496 — guest accounts (job-seeker focus, 2026-10-03).
--
-- A signed-out visitor on /build or the studio gets a silent server-side
-- GUEST user the first time they need the server (save, render, connect a
-- network, post to ONE destination). No email, no form. When they later sign
-- up or sign in, `adopt_guest_user` moves everything the guest owns onto the
-- real account and deletes the guest row — "a unique id for the visitor,
-- assigned to the user when they create the account".
--
-- Guest rows: is_guest = true, email `guest-<uuid>@guest.invalid` (RFC 2606
-- .invalid never delivers; users.email stays NOT NULL UNIQUE), no password.
--
-- Idempotent: IF NOT EXISTS / CREATE OR REPLACE throughout.

ALTER TABLE users ADD COLUMN IF NOT EXISTS is_guest boolean NOT NULL DEFAULT false;

-- Stale-guest sweep + admin exclusion scan only the (small) guest slice.
CREATE INDEX IF NOT EXISTS idx_users_is_guest_created
  ON users (created_at)
  WHERE is_guest;

-- Move every row owned by p_guest to p_target, then delete the guest.
--
-- Discovers owner columns dynamically so new tables are covered without
-- touching this function:
--   * every single-column FK referencing users(id), and
--   * every text/varchar `user_id` column (legacy studio side tables that
--     never got an FK).
-- A unique collision (1:1 tables such as profiles/preferences, or a social
-- account the real user already connected) keeps the REAL user's row and
-- drops the guest's. Runs in one transaction (a single function call).
--
-- Returns the number of rows moved, or -1 when p_guest is not a guest.
CREATE OR REPLACE FUNCTION adopt_guest_user(p_guest uuid, p_target uuid)
RETURNS integer
LANGUAGE plpgsql
AS $fn$
DECLARE
  r record;
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
        EXECUTE format('DELETE FROM %I.%I WHERE %I::text = $1', r.sch, r.tbl, r.col)
          USING p_guest::text;
    END;
  END LOOP;

  DELETE FROM users WHERE id = p_guest;
  RETURN moved;
END;
$fn$;
