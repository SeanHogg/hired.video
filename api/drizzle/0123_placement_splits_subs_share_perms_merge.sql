-- Migration 0123 — Placement splits / subs + Job share permissions +
-- Person-merge review queue. Bundled per the same root cause they
-- share: every new entry below is a small, isolated schema addition
-- against the Consolidated Gap Register (#228, #230, #240, #265).

-- ─── #228 — Placement splits across recruiters ────────────────────────
-- One placement may credit N owners (recruiters / sourcers). Validation
-- happens in the service layer (sum to 10000 bps). Commission engine
-- fans out per row.
CREATE TABLE IF NOT EXISTS "placement_splits" (
  "id"             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "placement_id"   uuid NOT NULL REFERENCES "placements" ("id") ON DELETE CASCADE,
  "owner_user_id"  uuid NOT NULL,
  -- 'recruiter' | 'sourcer' | 'manager' — varchar so the workspace can
  -- add custom roles without a migration.
  "owner_type"     varchar(24) NOT NULL DEFAULT 'recruiter',
  "percent_bps"    integer NOT NULL,
  "created_at"     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "idx_placement_splits_placement_id"
  ON "placement_splits" ("placement_id");
CREATE INDEX IF NOT EXISTS "idx_placement_splits_owner_user_id"
  ON "placement_splits" ("owner_user_id");

-- ─── #230 — Per-placement email-notification subscriptions ────────────
-- One row per (placement × event × user). Fires on stage events
-- (signed / started / first-day / guarantee-expires).
CREATE TABLE IF NOT EXISTS "placement_notification_subscriptions" (
  "id"            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "placement_id"  uuid NOT NULL REFERENCES "placements" ("id") ON DELETE CASCADE,
  "user_id"       uuid NOT NULL,
  -- 'signed' | 'started' | 'first_day' | 'guarantee_expires' | etc. —
  -- varchar so new event names can be added without a migration.
  "event"         varchar(48) NOT NULL,
  "created_at"    timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "uq_placement_notif_subs_placement_user_event"
  ON "placement_notification_subscriptions" ("placement_id", "user_id", "event");
CREATE INDEX IF NOT EXISTS "idx_placement_notif_subs_event"
  ON "placement_notification_subscriptions" ("event");

-- ─── #240 — Granular Job Share Permissions matrix ─────────────────────
-- JSONB blob on `job_items` — one boolean per candidate field shared
-- with the hiring-manager portal. Default null = use the tenant default
-- (currently "share everything"). Service-side renderer gates each
-- field against the matrix when present.
ALTER TABLE "job_items"
  ADD COLUMN IF NOT EXISTS "share_permissions" jsonb;
-- Optional GIN index — only useful when we start querying by which
-- fields are shared (rare); skipping by default to keep write cost
-- normal.

-- ─── #265 — Auto-merge vs review queue for duplicate persons ──────────
-- Workspace policy + a queue of pending merges. When the workspace
-- selects manual-review, candidate-merge events drop a row here for
-- owner approval instead of merging directly. Auto-merge applies the
-- BurnRateOS confidence threshold.
CREATE TABLE IF NOT EXISTS "workspace_person_merge_policy" (
  "workspace_id"          uuid PRIMARY KEY,
  -- 'auto' | 'review' — anything else falls back to 'auto' at the
  -- service layer for safety.
  "mode"                  varchar(16) NOT NULL DEFAULT 'auto',
  -- Confidence cutoff used when mode='auto'. Stored as integer bps so
  -- 9500 = 0.95.
  "auto_threshold_bps"    integer NOT NULL DEFAULT 9500,
  "updated_at"            timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "person_merge_queue" (
  "id"             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "workspace_id"   uuid,
  "owner_user_id"  uuid NOT NULL,
  "target_person_id" uuid NOT NULL,
  "source_person_id" uuid NOT NULL,
  -- 0–10000 bps confidence the reconciler computed.
  "confidence_bps" integer NOT NULL,
  -- 'pending' | 'approved' | 'rejected' | 'merged' | 'expired'.
  "status"         varchar(16) NOT NULL DEFAULT 'pending',
  "decided_at"     timestamptz,
  "decided_by"     uuid,
  "created_at"     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "idx_person_merge_queue_owner_status"
  ON "person_merge_queue" ("owner_user_id", "status");
CREATE INDEX IF NOT EXISTS "idx_person_merge_queue_workspace_status"
  ON "person_merge_queue" ("workspace_id", "status");
