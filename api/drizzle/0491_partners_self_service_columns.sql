-- Migration 0491 — reconcile `partners` with the self-service columns.
--
-- Root cause (support ticket 2026-07-05, pg 42703 on GET
-- /api/admin/partners?status=pending):
--   Migration 0489 created `partners` and was recorded in the runner's
--   `_sql_migrations` table on the deploy that shipped the ORIGINAL
--   (admin-provisioned-only) shape. The self-service request/approval
--   flow later added four nullable columns to 0489's CREATE TABLE
--   IN PLACE. Because the runner runs each file at most ONCE
--   (scripts/run-sql-migrations.mjs — "no replay"), the edited 0489 is
--   skipped on every subsequent deploy, so those columns never landed in
--   production. Drizzle's `db.select().from(partners)` selects all schema
--   columns, so `listPartnersByStatus` fails with "column does not exist".
--
-- Editing an already-applied migration in place cannot reconcile an
-- existing table; a NEW forward-only migration must. Each ADD COLUMN
-- uses IF NOT EXISTS so this is a true no-op on any DB that already has
-- the columns (fresh installs, where 0489 created the full shape).
--
-- See api/src/db/schema/partners.ts for the Drizzle SSoT.

ALTER TABLE "partners"
  ADD COLUMN IF NOT EXISTS "owner_user_id" uuid REFERENCES "users"("id") ON DELETE CASCADE;
ALTER TABLE "partners"
  ADD COLUMN IF NOT EXISTS "request_note" text;
ALTER TABLE "partners"
  ADD COLUMN IF NOT EXISTS "approved_at" timestamptz;
ALTER TABLE "partners"
  ADD COLUMN IF NOT EXISTS "approved_by" uuid REFERENCES "users"("id") ON DELETE SET NULL;

-- The owner index in 0489 could not have been created on a DB missing
-- owner_user_id; (re)assert it idempotently now that the column exists.
CREATE INDEX IF NOT EXISTS "idx_partners_owner" ON "partners" ("owner_user_id");
