-- Migration: SuperAdmin impersonation, permission debugger, and module system
-- Run: npx drizzle-kit migrate  OR  apply manually via psql

-- ── 1. Extend users table ────────────────────────────────────────────────────
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_super_admin BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS session_version INTEGER NOT NULL DEFAULT 0;

-- Seed the first SuperAdmin (update email as needed)
-- UPDATE users SET is_super_admin = TRUE WHERE email = 'seanhogg@gmail.com';

-- ── 2. Impersonation sessions ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS impersonation_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  super_admin_id UUID NOT NULL REFERENCES users(id),
  target_user_id UUID NOT NULL REFERENCES users(id),
  token_id TEXT NOT NULL UNIQUE,
  reason TEXT NOT NULL,
  debugger_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ NOT NULL,
  end_reason VARCHAR(50),
  pages_visited JSONB NOT NULL DEFAULT '[]',
  write_block_count INTEGER NOT NULL DEFAULT 0
);

-- ── 3. In-session role switches ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS impersonation_role_switches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES impersonation_sessions(id) ON DELETE CASCADE,
  from_role VARCHAR(100) NOT NULL,
  to_role VARCHAR(100) NOT NULL,
  switched_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── 4. Role-level permission overrides ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS role_permission_overrides (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  role VARCHAR(100) NOT NULL,
  permission_key VARCHAR(200) NOT NULL,
  granted BOOLEAN NOT NULL,
  reason TEXT,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(role, permission_key)
);

-- ── 5. Modules ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS modules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(200) NOT NULL UNIQUE,
  slug VARCHAR(200) NOT NULL UNIQUE,
  description TEXT,
  required_role VARCHAR(100) NOT NULL,
  plan_tier VARCHAR(50) NOT NULL DEFAULT 'free',
  permissions JSONB NOT NULL DEFAULT '[]',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed initial modules
INSERT INTO modules (name, slug, required_role, plan_tier, permissions) VALUES
  ('Job Posting',        'job-posting',        'Recruiter', 'free',       '["canPostJobs","canEditJobs","canDeleteJobs","canManageJobs"]'),
  ('Resume Review',      'resume-review',      'Recruiter', 'free',       '["canViewResumes"]'),
  ('Video Studio',       'video-studio',       'JobSeeker', 'free',       '["canCreateResume","canUploadVideo"]'),
  ('AI Coach',           'ai-coach',           'JobSeeker', 'pro',        '["canUseAICoach"]'),
  ('Interview Practice', 'interview-practice', 'JobSeeker', 'pro',        '["canAccessInterviewPractice"]'),
  ('Outreach',           'outreach',           'Recruiter', 'pro',        '["canSendOutreach"]'),
  ('Analytics',          'analytics',          'Employer',  'pro',        '["canAccessAnalytics"]'),
  ('Team Management',    'team-management',    'Employer',  'free',       '["canManageTeam","canManageAccount"]'),
  ('Affiliate Program',  'affiliate-program',  'Affiliate', 'free',       '["canAccessAffiliatePortal"]')
ON CONFLICT (slug) DO NOTHING;

-- ── 6. User module assignments ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS user_module_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  module_id UUID NOT NULL REFERENCES modules(id) ON DELETE CASCADE,
  assigned_by UUID REFERENCES users(id),
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revoked_at TIMESTAMPTZ,
  UNIQUE(user_id, module_id)
);

-- ── 7. Per-user permission overrides ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS user_permission_overrides (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  permission_key VARCHAR(200) NOT NULL,
  granted BOOLEAN NOT NULL DEFAULT TRUE,
  source VARCHAR(200) NOT NULL,
  granted_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, permission_key)
);

-- ── 8. Admin audit log (append-only) ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS admin_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id UUID NOT NULL REFERENCES users(id),
  impersonation_session_id UUID REFERENCES impersonation_sessions(id),
  action VARCHAR(200) NOT NULL,
  target_type VARCHAR(50),
  target_id TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_impersonation_sessions_admin ON impersonation_sessions(super_admin_id);
CREATE INDEX IF NOT EXISTS idx_impersonation_sessions_target ON impersonation_sessions(target_user_id);
CREATE INDEX IF NOT EXISTS idx_impersonation_sessions_active ON impersonation_sessions(super_admin_id) WHERE ended_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_admin_audit_log_actor ON admin_audit_log(actor_id);
CREATE INDEX IF NOT EXISTS idx_admin_audit_log_target ON admin_audit_log(target_id);
CREATE INDEX IF NOT EXISTS idx_admin_audit_log_created ON admin_audit_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_module_assignments_user ON user_module_assignments(user_id);
CREATE INDEX IF NOT EXISTS idx_user_permission_overrides_user ON user_permission_overrides(user_id);
