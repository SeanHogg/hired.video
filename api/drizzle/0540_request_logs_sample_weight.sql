-- Migration 0540 — request_logs sampling weight (W1-B, #2410–#2417).
--
-- request_logs took one INSERT per request, which kept Neon busy for every
-- API call. The writer (api/src/middleware/requestLogger.ts) now skips
-- crawler/beacon/asset paths and records only 1 in N successful, fast GETs;
-- every non-GET, every 4xx/5xx and every slow request is still written.
-- `sample_weight` is how many requests a row stands for (1 = unsampled,
-- N = the 1-in-N sample), so ObservabilityRepository's aggregates
-- (calls, totals, per-release counts, weighted avg latency) multiply by it
-- and stay unbiased.
--
-- Additive only: one NOT NULL column with a constant default (no table
-- rewrite on PG 11+). Existing rows read as weight 1, which is what they
-- were. Idempotent: ADD COLUMN IF NOT EXISTS (CI's drizzle-kit push may add
-- it first). Declared in db/schema/analytics.ts.

ALTER TABLE request_logs ADD COLUMN IF NOT EXISTS sample_weight integer NOT NULL DEFAULT 1;
