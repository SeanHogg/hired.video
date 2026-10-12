-- Migration 0341 — agency-team sharing for the BD pipeline (gap #1766).
--
-- Background: every BD client + deal was owner-scoped by `recruiter_user_id`,
-- so an agency where multiple recruiters work the same accounts each saw only
-- their own rows. Adding a nullable `workspace_id` (the company/agency the
-- recruiter acts for) lets reads fall through `workspace_id IN (caller's
-- workspaces) OR recruiter_user_id = caller`, so teammates share clients/deals
-- while solo recruiters (workspace_id NULL) keep exactly today's behavior.
--
-- No backfill: existing rows stay NULL (owner-only) — non-lossy, no behavior
-- change for current data. New rows stamp the recruiter's primary workspace.
-- Idempotent via IF NOT EXISTS. Drizzle declarations live in
-- api/src/db/schema/recruiterBd.ts.

ALTER TABLE "recruiter_clients"
  ADD COLUMN IF NOT EXISTS "workspace_id" uuid REFERENCES "company_profiles"("id") ON DELETE SET NULL;

ALTER TABLE "recruiter_deals"
  ADD COLUMN IF NOT EXISTS "workspace_id" uuid REFERENCES "company_profiles"("id") ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS "idx_recruiter_clients_workspace"
  ON "recruiter_clients" ("workspace_id");

CREATE INDEX IF NOT EXISTS "idx_recruiter_deals_workspace"
  ON "recruiter_deals" ("workspace_id");
