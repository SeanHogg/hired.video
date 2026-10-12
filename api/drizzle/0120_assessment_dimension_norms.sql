-- Migration: 0120_assessment_dimension_norms
--
-- Predictive-assessment norming cache (gap #1232 — first step toward
-- HireVue-grade calibration). Holds percentile breakpoints per
-- (assessment_kind, dimension), recomputed periodically by a worker
-- that scans completed `assessment_runs`. The scoring service consults
-- this table to convert raw 0..1 dimension scores into percentile
-- bands like "Top 12%" — defensible because the percentiles are
-- against the platform's own actual response distribution, not a
-- guess.
--
-- We deliberately do NOT swap the raw score out — the UI shows both
-- so a candidate sees both their absolute score and their position
-- relative to platform norms. Adverse-impact analysis + EEO defense
-- need the raw + the percentile.

CREATE TABLE IF NOT EXISTS assessment_dimension_norms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  assessment_kind varchar(64) NOT NULL,
  dimension       varchar(64) NOT NULL,

  -- Percentile breakpoints — JSON array of 101 values (0..100) where
  -- index i holds the raw 0..1 score at the i-th percentile. Storing
  -- as full curve lets the helper interpolate at any percentile
  -- without a recompute.
  percentile_curve jsonb NOT NULL,

  -- Provenance — when computed + over how many completed runs.
  sample_size integer NOT NULL,
  recomputed_at timestamptz NOT NULL DEFAULT now(),

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- One row per (kind, dimension); UPSERT on recompute via this index.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_assessment_dimension_norms_kind_dim
  ON assessment_dimension_norms (assessment_kind, dimension);
