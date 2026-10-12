-- #241 — Hiring-manager scorecard visibility.
-- Per-job override (nullable = inherit the company default) + a company-wide
-- default. Modes: always_show_hm | always_hide_hm | hide_hm_until_submit.
ALTER TABLE "job_items" ADD COLUMN IF NOT EXISTS "scorecard_hm_visibility" varchar(24);

ALTER TABLE "company_profiles" ADD COLUMN IF NOT EXISTS "scorecard_hm_visibility_default" varchar(24) NOT NULL DEFAULT 'always_show_hm';
