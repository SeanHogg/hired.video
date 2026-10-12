-- Migration 0175 — Canonicalize job_items.job_type to the kebab-case SSoT
-- (renumbered from 0171 after external migrations claimed that slot).
-- (#1673). Fixes the silent filter-miss: the public-job filter does an
-- exact `eq(job_items.job_type, employmentType)`, so a job stored as
-- "FullTime" or "full_time" never matched a filter "full-time".
--
-- Maps the three legacy spellings (PascalCase form / snake_case
-- scraper-AI / mixed) onto canonical kebab. Mirrors normalizeEmploymentType()
-- in shared/employment-types.ts. New writes are normalized in
-- JobService; this fixes the historical rows. Idempotent — re-running maps
-- already-canonical values to themselves.

UPDATE job_items SET job_type = CASE lower(regexp_replace(job_type, '[\s_-]+', '', 'g'))
  WHEN 'fulltime'        THEN 'full-time'
  WHEN 'parttime'        THEN 'part-time'
  WHEN 'contract'        THEN 'contract'
  WHEN 'contractor'      THEN 'contract'
  WHEN 'contracttohire'  THEN 'contract-to-hire'
  WHEN 'c2h'             THEN 'contract-to-hire'
  WHEN 'freelance'       THEN 'freelance'
  WHEN 'freelancer'      THEN 'freelance'
  WHEN 'internship'      THEN 'internship'
  WHEN 'intern'          THEN 'internship'
  WHEN 'temporary'       THEN 'temporary'
  WHEN 'temp'            THEN 'temporary'
  WHEN 'volunteer'       THEN 'volunteer'
  WHEN 'fractional'      THEN 'fractional'
  WHEN 'advisor'         THEN 'advisor'
  WHEN 'advisory'        THEN 'advisor'
  WHEN 'interim'         THEN 'interim'
  WHEN 'boardseat'       THEN 'board-seat'
  WHEN 'board'           THEN 'board-seat'
  ELSE job_type  -- leave unrecognized values untouched
END
WHERE job_type IS NOT NULL
  AND job_type <> CASE lower(regexp_replace(job_type, '[\s_-]+', '', 'g'))
    WHEN 'fulltime'        THEN 'full-time'
    WHEN 'parttime'        THEN 'part-time'
    WHEN 'contract'        THEN 'contract'
    WHEN 'contractor'      THEN 'contract'
    WHEN 'contracttohire'  THEN 'contract-to-hire'
    WHEN 'c2h'             THEN 'contract-to-hire'
    WHEN 'freelance'       THEN 'freelance'
    WHEN 'freelancer'      THEN 'freelance'
    WHEN 'internship'      THEN 'internship'
    WHEN 'intern'          THEN 'internship'
    WHEN 'temporary'       THEN 'temporary'
    WHEN 'temp'            THEN 'temporary'
    WHEN 'volunteer'       THEN 'volunteer'
    WHEN 'fractional'      THEN 'fractional'
    WHEN 'advisor'         THEN 'advisor'
    WHEN 'advisory'        THEN 'advisor'
    WHEN 'interim'         THEN 'interim'
    WHEN 'boardseat'       THEN 'board-seat'
    WHEN 'board'           THEN 'board-seat'
    ELSE job_type
  END;
