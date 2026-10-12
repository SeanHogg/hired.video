-- Gamification aggregate: points + streaks + badges + fraud flags.
-- Separate ledger from user_token_balance because earned points are
-- suspendable / reversible for fraud and we don't want a rollback to
-- touch purchased AI tokens.

CREATE TABLE IF NOT EXISTS "user_points_balance" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" uuid NOT NULL UNIQUE REFERENCES "users"("id") ON DELETE CASCADE,
  "balance" integer NOT NULL DEFAULT 0,
  "lifetime_earned" integer NOT NULL DEFAULT 0,
  "lifetime_redeemed" integer NOT NULL DEFAULT 0,
  "lifetime_reversed" integer NOT NULL DEFAULT 0,
  "is_suspended" boolean NOT NULL DEFAULT false,
  "suspended_at" timestamptz,
  "suspended_reason" text,
  "suspended_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "user_points_balance_suspended_idx"
  ON "user_points_balance" ("is_suspended")
  WHERE "is_suspended" = true;

CREATE TABLE IF NOT EXISTS "points_ledger" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "delta" integer NOT NULL,
  "category" varchar(20) NOT NULL,
  "action" varchar(80) NOT NULL,
  "source" varchar(40) NOT NULL,
  "ref_id" text,
  "ref_type" varchar(40),
  "reverses_id" uuid,
  "metadata" jsonb,
  "created_at" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "points_ledger_user_created_idx"
  ON "points_ledger" ("user_id", "created_at");
CREATE INDEX IF NOT EXISTS "points_ledger_action_idx"
  ON "points_ledger" ("action");
CREATE INDEX IF NOT EXISTS "points_ledger_ref_idx"
  ON "points_ledger" ("ref_type", "ref_id");
CREATE UNIQUE INDEX IF NOT EXISTS "points_ledger_dedup_uniq"
  ON "points_ledger" ("user_id", "action", "ref_id", "category")
  WHERE "ref_id" IS NOT NULL;

CREATE TABLE IF NOT EXISTS "points_activity_counters" (
  "user_id" uuid PRIMARY KEY REFERENCES "users"("id") ON DELETE CASCADE,
  "user_task_completions" integer NOT NULL DEFAULT 0,
  "system_task_completions" integer NOT NULL DEFAULT 0,
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "points_streaks" (
  "user_id" uuid PRIMARY KEY REFERENCES "users"("id") ON DELETE CASCADE,
  "current_streak" integer NOT NULL DEFAULT 0,
  "longest_streak" integer NOT NULL DEFAULT 0,
  "last_activity_date" date,
  "last_bonus_at" timestamptz,
  "last_bonus_milestone" integer NOT NULL DEFAULT 0,
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "points_fraud_flags" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "kind" varchar(60) NOT NULL,
  "severity" varchar(10) NOT NULL,
  "evidence" jsonb,
  "status" varchar(20) NOT NULL DEFAULT 'open',
  "auto_suspended" boolean NOT NULL DEFAULT false,
  "reviewed_at" timestamptz,
  "reviewed_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "reviewer_notes" text,
  "created_at" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "points_fraud_flags_user_status_idx"
  ON "points_fraud_flags" ("user_id", "status");
CREATE INDEX IF NOT EXISTS "points_fraud_flags_status_created_idx"
  ON "points_fraud_flags" ("status", "created_at");

CREATE TABLE IF NOT EXISTS "badges" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "slug" varchar(80) NOT NULL UNIQUE,
  "name" varchar(120) NOT NULL,
  "description" text NOT NULL,
  "tier" varchar(20) NOT NULL DEFAULT 'bronze',
  "icon_key" varchar(80),
  "points_reward" integer NOT NULL DEFAULT 0,
  "roles" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "is_active" boolean NOT NULL DEFAULT true,
  "created_at" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "user_badges" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "badge_id" uuid NOT NULL REFERENCES "badges"("id") ON DELETE CASCADE,
  "awarded_for" jsonb,
  "awarded_at" timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "user_badges_user_badge_uniq"
  ON "user_badges" ("user_id", "badge_id");
CREATE INDEX IF NOT EXISTS "user_badges_user_awarded_idx"
  ON "user_badges" ("user_id", "awarded_at");

-- Seed the v1 badge catalog. Job-seeker first; recruiter/employer in phase 2.
INSERT INTO "badges" ("slug", "name", "description", "tier", "icon_key", "points_reward", "roles")
VALUES
  ('first_task', 'First Steps', 'Completed your first task.', 'bronze', 'check', 25, '["job_seeker"]'::jsonb),
  ('streak_7', 'Week Warrior', 'Stayed active 7 days in a row.', 'silver', 'flame', 100, '["job_seeker"]'::jsonb),
  ('streak_30', 'Monthly Momentum', '30-day activity streak.', 'gold', 'flame', 500, '["job_seeker"]'::jsonb),
  ('first_application', 'In the Arena', 'Submitted your first job application.', 'bronze', 'send', 50, '["job_seeker"]'::jsonb),
  ('applications_10', 'Application Sprinter', 'Submitted 10 job applications.', 'silver', 'send', 150, '["job_seeker"]'::jsonb),
  ('applications_50', 'Application Marathon', 'Submitted 50 job applications.', 'gold', 'send', 500, '["job_seeker"]'::jsonb),
  ('hundred_tasks', 'Centurion', 'Closed 100 user-created tasks — points gate unlocked.', 'silver', 'shield', 250, '["job_seeker"]'::jsonb),
  ('ai_tool_first', 'AI Apprentice', 'Used an AI tool for the first time.', 'bronze', 'sparkles', 25, '["job_seeker"]'::jsonb),
  ('purchase_first', 'Supporter', 'Made your first purchase.', 'bronze', 'gift', 100, '["job_seeker"]'::jsonb)
ON CONFLICT ("slug") DO NOTHING;
