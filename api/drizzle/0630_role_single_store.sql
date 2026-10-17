-- 0630_role_single_store.sql
--
-- W3-D2 (architecture remediation 2026-10-17): roles were stored three ways.
--
--   * users.role             — THE store. One of USER_ROLES
--                              (shared/user-roles.ts); the JWT `roles` claim
--                              is `[users.role]` (AuthService).
--   * roles + user_roles     — a generic RBAC join pair from the legacy
--                              backfill (0129). No code in api/, frontend/,
--                              shared/, packages/ or extension reads or writes
--                              either table. Archived here.
--   * users.persona          — NOT a role duplicate: #104's "sales vs
--                              recruiting" label-set axis. Also dead (no
--                              reader/writer); its archive + drop is a
--                              follow-up because `drizzle-kit push` runs
--                              before this file (see users.ts).
--
-- What this file does, in order (every step idempotent):
--   1. Archive roles + user_roles (archive-first, never DROP; restore with
--      ALTER TABLE archive.<t> SET SCHEMA public). Their declarations were
--      removed from api/src/db/schema/users.ts in the same change; push only
--      manages declared tables (tablesFilter) in the public schema.
--   2. Keep a recoverable copy of every users.role value that is not
--      canonical, then canonicalize it with the ROLE_ALIASES map from
--      shared/user-roles.ts. A value no alias knows becomes 'job_seeker'
--      (least privilege; the original stays in archive.users_role_pre_0630).
--   3. Add users_role_check (NOT VALID per TEMPLATE.md rule 5; every
--      existing row already satisfies it after step 2). Declared in users.ts.

CREATE SCHEMA IF NOT EXISTS archive;

-- 1. Dead RBAC join tables -------------------------------------------------
ALTER TABLE IF EXISTS public.user_roles SET SCHEMA archive;
ALTER TABLE IF EXISTS public.roles SET SCHEMA archive;

-- 2. Canonicalize users.role ----------------------------------------------
CREATE TABLE IF NOT EXISTS archive.users_role_pre_0630 (
  user_id     uuid PRIMARY KEY,
  role        varchar(50),
  archived_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO archive.users_role_pre_0630 (user_id, role)
SELECT id, role
FROM public.users
WHERE role NOT IN ('job_seeker', 'recruiter', 'employer', 'employee', 'creator', 'affiliate', 'admin', 'super_admin')
ON CONFLICT (user_id) DO NOTHING;

UPDATE public.users
SET role = CASE lower(trim(role))
    WHEN 'jobseeker'     THEN 'job_seeker'
    WHEN 'job_seeker'    THEN 'job_seeker'
    WHEN 'job seeker'    THEN 'job_seeker'
    WHEN 'recruiter'     THEN 'recruiter'
    WHEN 'employer'      THEN 'employer'
    WHEN 'business'      THEN 'employer'
    WHEN 'employee'      THEN 'employee'
    WHEN 'creator'       THEN 'creator'
    WHEN 'affiliate'     THEN 'affiliate'
    WHEN 'admin'         THEN 'admin'
    WHEN 'administrator' THEN 'admin'
    WHEN 'superadmin'    THEN 'super_admin'
    WHEN 'super_admin'   THEN 'super_admin'
    WHEN 'super admin'   THEN 'super_admin'
    ELSE 'job_seeker'
  END,
  updated_at = now()
WHERE role NOT IN ('job_seeker', 'recruiter', 'employer', 'employee', 'creator', 'affiliate', 'admin', 'super_admin');

-- 3. CHECK from USER_ROLES --------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'users_role_check') THEN
    ALTER TABLE public.users
      ADD CONSTRAINT users_role_check
      CHECK (role IN ('job_seeker', 'recruiter', 'employer', 'employee', 'creator', 'affiliate', 'admin', 'super_admin')) NOT VALID;
  END IF;
END $$;
