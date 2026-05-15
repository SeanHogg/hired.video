-- 0082 — moderation: capture entity owner at report time + expand entity types
--
-- Builds on 0019 (content_reports introduced for #152). Two changes:
--
--   • `entity_owner_id` — denormalized snapshot of who owned the reported
--     entity AT THE MOMENT the report was filed. The owner can change
--     later (companies transfer assets, profiles deactivate), but for
--     the audit trail + downstream notification routing we want the
--     value at the time of report. Nullable because legacy rows (#152
--     pre-this-migration) don't have it.
--
--   • Implicit: `entity_type` column accepts new values `studio_template`
--     and `studio_project`. The column is varchar(64), so no DDL change
--     is required — the constraint is the application-level enum in
--     [reports.ts](api/src/db/schema/reports.ts). This migration is the
--     audit-trail entry that these new types are now part of the
--     reportable surface, even though the SQL change is just the owner
--     column.

ALTER TABLE content_reports
  ADD COLUMN IF NOT EXISTS entity_owner_id uuid REFERENCES users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_content_reports_owner
  ON content_reports (entity_owner_id, created_at);
