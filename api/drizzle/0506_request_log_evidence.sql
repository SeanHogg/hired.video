-- Migration 0506 — make request_logs answer "is this feature live and working?"
--
-- request_logs only stored the raw path (ids embedded, so rows could not be
-- grouped by feature), the status code and no deploy identity. Adds:
--   route        — matched Hono route pattern, e.g. /api/resumes/:id
--   release_id   — deployed Worker version (CF_VERSION_METADATA.id)
--   error_code   — error.code of a 4xx/5xx JSON envelope
--   error_source — error._source as "file:line" (SuperAdmin-only in responses,
--                  always recorded here)
-- Single writer: api/src/middleware/requestLogger.ts. Read by
-- ObservabilityRepository (GET /api/analytics/usage, SuperAdmin).
--
-- Idempotent: CI's drizzle-kit push may add the columns/index first.

ALTER TABLE request_logs ADD COLUMN IF NOT EXISTS route varchar(255);
ALTER TABLE request_logs ADD COLUMN IF NOT EXISTS release_id varchar(64);
ALTER TABLE request_logs ADD COLUMN IF NOT EXISTS error_code varchar(100);
ALTER TABLE request_logs ADD COLUMN IF NOT EXISTS error_source text;

CREATE INDEX IF NOT EXISTS idx_request_logs_route_created
  ON request_logs (route, created_at)
  WHERE route IS NOT NULL;
