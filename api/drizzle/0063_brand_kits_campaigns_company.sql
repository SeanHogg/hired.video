-- Brand Kits + Campaigns Company Ownership
--
-- Extends the workspace ownership model (migration 0058) to brand kits
-- and ad campaigns. Same semantics:
--   * company_id NULL  - personal asset, user_id is the owner
--   * company_id SET   - company asset, user_id is the editor / last actor
--
-- Reads filter via buildOwnershipFilter() in services/studio/workspace.ts.
-- Writes gate via assertCanWrite() in the same module.
--
-- Cascade: company delete wipes the asset (the company owned it).

-- studio_brand_kits --------------------------------------------------------
ALTER TABLE studio_brand_kits ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES company_profiles(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_studio_brand_kits_company ON studio_brand_kits(company_id);

-- video_campaigns ----------------------------------------------------------
ALTER TABLE video_campaigns ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES company_profiles(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_video_campaigns_company ON video_campaigns(company_id);
