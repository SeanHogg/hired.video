-- Migration: add `company_id` FK to `job_items`.
--
-- Lets `requireJobOwner` (services/jobs/jobOwnership.ts) widen permission
-- from "the original poster" to "any active member of the job's company"
-- so multi-recruiter teams can co-manage one pipeline. Nullable so legacy
-- jobs that pre-date the column keep working.
--
-- Backfills the company by walking from `posted_by_user_id` →
-- `user_company_role_associations` (single active company) when unambiguous.
-- Jobs whose poster belongs to multiple companies stay NULL — owner-only
-- access is preserved for those.

ALTER TABLE job_items
  ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES company_profiles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_job_items_company ON job_items (company_id);

-- Backfill — only when the poster is an active member of exactly one company.
WITH single_company AS (
  SELECT
    user_id,
    company_id
  FROM (
    SELECT
      uca.user_id,
      uca.company_id,
      COUNT(*) OVER (PARTITION BY uca.user_id) AS company_count
    FROM user_company_role_associations uca
    WHERE uca.is_active = TRUE
  ) AS s
  WHERE company_count = 1
)
UPDATE job_items ji
SET company_id = sc.company_id
FROM single_company sc
WHERE ji.company_id IS NULL
  AND ji.posted_by_user_id = sc.user_id;
