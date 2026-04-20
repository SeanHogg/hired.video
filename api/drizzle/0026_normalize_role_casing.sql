-- Migration: 0026_normalize_role_casing
-- Converts legacy PascalCase role values in `users.role` and
-- `modules.required_role` to the canonical snake_case form declared in
-- shared/user-roles.ts. Prior seeds (0001_superadmin_impersonation.sql)
-- committed PascalCase values before the snake_case migration shipped,
-- leaving rows whose role strings don't match backend / frontend lookups
-- (broke the Admin Panel sidebar gate, module role checks, etc.).
--
-- Idempotent: safe to re-run. Rows already in snake_case are left alone.

UPDATE users SET role = 'super_admin' WHERE role = 'SuperAdmin';
UPDATE users SET role = 'admin'       WHERE role = 'Admin';
UPDATE users SET role = 'job_seeker'  WHERE role IN ('JobSeeker', 'Job Seeker');
UPDATE users SET role = 'recruiter'   WHERE role = 'Recruiter';
UPDATE users SET role = 'employer'    WHERE role = 'Employer';

-- Module gating — the seed inserted PascalCase role names into
-- modules.required_role. Normalize to match users.role.
UPDATE modules SET required_role = 'super_admin' WHERE required_role = 'SuperAdmin';
UPDATE modules SET required_role = 'admin'       WHERE required_role = 'Admin';
UPDATE modules SET required_role = 'job_seeker'  WHERE required_role IN ('JobSeeker', 'Job Seeker');
UPDATE modules SET required_role = 'recruiter'   WHERE required_role = 'Recruiter';
UPDATE modules SET required_role = 'employer'    WHERE required_role = 'Employer';

-- 'Affiliate' is no longer a role (it's an opt-in service). The Affiliate
-- Program module was previously gated by this non-role value, which meant
-- no user could ever pass the gate. Reassign to 'job_seeker' so the module
-- is reachable; access is really controlled by the affiliate flag on the
-- user record, not this required_role column.
UPDATE modules SET required_role = 'job_seeker' WHERE required_role = 'Affiliate';
