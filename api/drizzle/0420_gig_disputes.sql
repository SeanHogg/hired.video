-- Migration 0420 — gig milestone dispute resolution (#1768, TK7 block 0420-0439).
--
-- When the poster and awarded creator disagree on a milestone, either party
-- opens a dispute (milestone.status → 'disputed', frozen from approve/release).
-- Both sides append evidence/comments to an append-only timeline; a platform
-- mediator (SuperAdmin) decides the escrow direction ('release' pays the
-- creator, 'refund' returns it to the poster), closing the dispute.
--
-- Idempotent per drizzle/TEMPLATE.md (CREATE TABLE/INDEX IF NOT EXISTS).

CREATE TABLE IF NOT EXISTS "gig_disputes" (
  "id"                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "milestone_id"        uuid NOT NULL REFERENCES "gig_milestones"("id") ON DELETE CASCADE,
  "project_id"          uuid NOT NULL REFERENCES "gig_projects"("id") ON DELETE CASCADE,
  "opened_by_user_id"   uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "reason"              text NOT NULL,
  "status"              varchar(16) NOT NULL DEFAULT 'open',
  "resolution"          varchar(16),
  "resolution_note"     text,
  "resolved_by_user_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at"          timestamptz NOT NULL DEFAULT now(),
  "resolved_at"         timestamptz,
  "updated_at"          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "idx_gig_disputes_milestone" ON "gig_disputes" ("milestone_id");
CREATE INDEX IF NOT EXISTS "idx_gig_disputes_project" ON "gig_disputes" ("project_id");
-- At most one OPEN dispute per milestone.
CREATE UNIQUE INDEX IF NOT EXISTS "uq_gig_disputes_open_per_milestone"
  ON "gig_disputes" ("milestone_id") WHERE "status" = 'open';

CREATE TABLE IF NOT EXISTS "gig_dispute_events" (
  "id"             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "dispute_id"     uuid NOT NULL REFERENCES "gig_disputes"("id") ON DELETE CASCADE,
  "author_user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "kind"           varchar(16) NOT NULL,
  "body"           text NOT NULL,
  "attachments"    jsonb NOT NULL DEFAULT '[]'::jsonb,
  "created_at"     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "idx_gig_dispute_events_dispute"
  ON "gig_dispute_events" ("dispute_id", "created_at");
