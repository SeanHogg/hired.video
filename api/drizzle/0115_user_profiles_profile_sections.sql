-- Migration: 0114_user_profiles_profile_sections
--
-- Adds `profile_sections` (JSONB) to `user_profiles` for per-user
-- overrides of which sections appear on /people/[id]. Stored as a
-- partial of `ProfileSections` (see shared/profile-sections.ts) so
-- missing keys fall through to `getDefaultProfileSections(role)` at
-- render time. That fallback is why no backfill is needed: existing
-- rows get `{}` and immediately follow the role-based default
-- (recruiter/employer hide resume sections, job_seeker shows them).
--
-- New accounts get role-based defaults written explicitly at signup
-- by AuthService.handleRegister, so the persisted shape stays in
-- sync with the user's intent the moment they create the account.
--
-- Idempotent: safe to re-run.

ALTER TABLE "user_profiles"
  ADD COLUMN IF NOT EXISTS "profile_sections" jsonb NOT NULL DEFAULT '{}'::jsonb;
