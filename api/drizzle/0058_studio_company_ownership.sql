-- Studio Company Ownership Migration
--
-- Adds company-ownership to studio projects, videos, and studio templates.
--
-- Until now, studio assets were strictly user-owned: a recruiter at Acme who
-- created a "5 reasons to work here" video had it filed under their personal
-- account. If they left Acme, the video left with them. This migration
-- introduces company ownership so studio assets created on behalf of a
-- company stay with the company.
--
-- Semantics:
--   * company_id NULL          - personal asset, user_id is the owner
--   * company_id SET           - company asset, user_id is the editor /
--                                last actor (kept for audit + attribution)
--   * assigned_user_id (proj)  - optional "this is your work item" pointer
--                                surfaced inside a company workspace so
--                                multi-recruiter teams can self-divide work
--
-- Cascade behaviour:
--   * company delete - cascades the asset (company is the owner)
--   * user delete    - unchanged for now (still cascades). A follow-up
--                      migration will loosen user_id to ON DELETE SET NULL
--                      once the app reassigns company-owned content to the
--                      company owner before the cascade fires.
--
-- Read filter pattern (in app code):
--   WHERE user_id = :me OR company_id IN (:my_company_ids)
--
-- Write filter pattern (via assertCompanyEditor() in services/studio/workspace.ts):
--   if companyId set, require active membership on that company;
--   if companyId null, require user_id = me.

-- studio_projects ----------------------------------------------------------
ALTER TABLE studio_projects ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES company_profiles(id) ON DELETE CASCADE;

ALTER TABLE studio_projects ADD COLUMN IF NOT EXISTS assigned_user_id UUID REFERENCES users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_studio_projects_company ON studio_projects(company_id);

CREATE INDEX IF NOT EXISTS idx_studio_projects_assigned_user ON studio_projects(assigned_user_id);

-- videos -------------------------------------------------------------------
ALTER TABLE videos ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES company_profiles(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_videos_company ON videos(company_id);

-- studio_templates ---------------------------------------------------------
-- creator_id stays as the user who hit "publish" (royalty / attribution).
-- company_id, when set, means royalties accrue to the company instead of
-- the individual creator. Listings can be filtered to first-party by
-- (company_id = Hired.VIDEO Community) on the marketplace.
ALTER TABLE studio_templates ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES company_profiles(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_studio_templates_company ON studio_templates(company_id);
