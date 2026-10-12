-- Migration: 0029_user_bulk_admin
--
-- Adds the SuperAdmin bulk ban/delete flow on /admin/users:
--   1. `users.is_banned` — hard "account blocked AND hidden everywhere in
--      the product" flag. Separate from `is_suspended` because suspend is
--      reversible/visible and ban means "don't show anywhere". Banning
--      also sets is_active=false + is_suspended=true so every existing
--      isActive/isSuspended gate already blocks them.
--   2. FK cleanup so hard-DELETE of a (spammer) user can actually succeed.
--      The admin-surface tables (impersonation sessions, audit log,
--      module assignments, permission overrides, plan overrides) all
--      reference users.id with no ON DELETE action, which would refuse
--      the delete. Semantics:
--        • target_user_id, granted_by on user-scoped sidecars → CASCADE
--          (those rows belong to the deleted user)
--        • created_by / assigned_by / granted_by (admin actors on
--          someone else's row) → SET NULL (preserve the row, drop
--          the provenance pointer)
--        • admin_audit_log.actor_id → nullable + SET NULL (audit
--          history outlives the actor — a deleted spammer shouldn't
--          take unrelated admin actions down with them)

-- ─── 1. is_banned flag ───────────────────────────────────────────────────────
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_banned boolean NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS idx_users_is_banned ON users (is_banned) WHERE is_banned = true;

-- ─── 2. FK cleanup for hard-delete ───────────────────────────────────────────

-- impersonation_sessions: the spammer's sessions (as target) go with them.
-- super_admin_id also cascades as a safety net; service layer blocks deleting
-- a super-admin so this should never actually fire.
ALTER TABLE impersonation_sessions
  DROP CONSTRAINT IF EXISTS impersonation_sessions_super_admin_id_fkey;
ALTER TABLE impersonation_sessions
  ADD CONSTRAINT impersonation_sessions_super_admin_id_fkey
    FOREIGN KEY (super_admin_id) REFERENCES users(id) ON DELETE CASCADE;

ALTER TABLE impersonation_sessions
  DROP CONSTRAINT IF EXISTS impersonation_sessions_target_user_id_fkey;
ALTER TABLE impersonation_sessions
  ADD CONSTRAINT impersonation_sessions_target_user_id_fkey
    FOREIGN KEY (target_user_id) REFERENCES users(id) ON DELETE CASCADE;

-- role_permission_overrides.created_by — the override outlives its creator.
ALTER TABLE role_permission_overrides
  DROP CONSTRAINT IF EXISTS role_permission_overrides_created_by_fkey;
ALTER TABLE role_permission_overrides
  ADD CONSTRAINT role_permission_overrides_created_by_fkey
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL;

-- user_module_assignments.assigned_by — assignment outlives the assigning admin.
-- (user_id already cascades, so rows for the deleted user still go.)
ALTER TABLE user_module_assignments
  DROP CONSTRAINT IF EXISTS user_module_assignments_assigned_by_fkey;
ALTER TABLE user_module_assignments
  ADD CONSTRAINT user_module_assignments_assigned_by_fkey
    FOREIGN KEY (assigned_by) REFERENCES users(id) ON DELETE SET NULL;

-- user_permission_overrides.granted_by — override outlives the granting admin.
ALTER TABLE user_permission_overrides
  DROP CONSTRAINT IF EXISTS user_permission_overrides_granted_by_fkey;
ALTER TABLE user_permission_overrides
  ADD CONSTRAINT user_permission_overrides_granted_by_fkey
    FOREIGN KEY (granted_by) REFERENCES users(id) ON DELETE SET NULL;

-- user_plan_overrides.granted_by — plan override is user-scoped (user_id PK
-- already cascades). CASCADE here just means "if the granting admin is ever
-- hard-deleted, drop their outstanding overrides" — matches user-id cascade.
ALTER TABLE user_plan_overrides
  DROP CONSTRAINT IF EXISTS user_plan_overrides_granted_by_fkey;
ALTER TABLE user_plan_overrides
  ADD CONSTRAINT user_plan_overrides_granted_by_fkey
    FOREIGN KEY (granted_by) REFERENCES users(id) ON DELETE CASCADE;

-- admin_audit_log.actor_id — audit outlives the actor. Drop NOT NULL, then
-- SET NULL on delete so compliance history stays intact.
ALTER TABLE admin_audit_log ALTER COLUMN actor_id DROP NOT NULL;
ALTER TABLE admin_audit_log
  DROP CONSTRAINT IF EXISTS admin_audit_log_actor_id_fkey;
ALTER TABLE admin_audit_log
  ADD CONSTRAINT admin_audit_log_actor_id_fkey
    FOREIGN KEY (actor_id) REFERENCES users(id) ON DELETE SET NULL;
