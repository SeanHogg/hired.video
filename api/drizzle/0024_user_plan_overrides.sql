-- Migration: 0024_user_plan_overrides
--
-- SuperAdmin "admin override" — a single sidecar row per user that lets
-- staff comp a plan, raise/lower the monthly token limit, or grant a
-- trial period WITHOUT mutating the real subscription row. The real
-- subscription stays intact so the "original" state is always readable
-- and a one-click reset (DELETE) reverts the user.
--
-- Shape decisions:
--   • user_id is the PK (1:1 with users) — at most one active override
--     per user at a time. History of past overrides is kept in the
--     admin_audit_log via ADMIN_OVERRIDE_SET / ADMIN_OVERRIDE_CLEARED
--     entries rather than a history table on this schema.
--   • plan_slug is nullable: null = keep the subscription plan, only
--     override the monthly_token_limit (useful for raising a Free user's
--     cap without upgrading them).
--   • monthly_token_limit is nullable: null = use the plan default;
--     a positive integer = custom cap; sentinel -1 = unlimited.
--   • expires_at is nullable: null = permanent override; otherwise the
--     resolver ignores the row once now() > expires_at (acts like a
--     trial window). Expired rows stay in the table until an admin
--     clears them so audit/history is preserved.
--   • reason + granted_by are NOT NULL — every override must be
--     attributable and justified for compliance.

CREATE TABLE IF NOT EXISTS "user_plan_overrides" (
  "user_id" uuid PRIMARY KEY REFERENCES "users"("id") ON DELETE CASCADE,
  "plan_slug" varchar(50),
  "monthly_token_limit" integer,
  "expires_at" timestamptz,
  "reason" text NOT NULL,
  "granted_by" uuid NOT NULL REFERENCES "users"("id"),
  "granted_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

-- Partial index: expiry sweeper queries only need rows that actually expire.
CREATE INDEX IF NOT EXISTS "idx_user_plan_overrides_expires_at"
  ON "user_plan_overrides" ("expires_at")
  WHERE "expires_at" IS NOT NULL;

-- Index for joining onto the users list in searchUsers (PK already covers
-- single-user lookups, but the list query fetches many user_ids at once).
CREATE INDEX IF NOT EXISTS "idx_user_plan_overrides_granted_by"
  ON "user_plan_overrides" ("granted_by");
