-- Migration 0199 — Learning goals (onboarding funnel + learner north-star).
--
-- A learner's own stated objective ("I want to learn RAG"), captured in the
-- onboarding funnel and on the learner home. Drives course recommendations
-- and gives the AI brain a durable signal of intent. Distinct from
-- learning_assignments (someone else assigning work) — a goal is the
-- learner's own.
--
-- Idempotent per drizzle/TEMPLATE.md.

CREATE TABLE IF NOT EXISTS "learning_goals" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "goal_text" text NOT NULL,
  "status" varchar(16) NOT NULL DEFAULT 'active',
  "source" varchar(16) NOT NULL DEFAULT 'manual',
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "idx_learning_goals_user"
  ON "learning_goals" ("user_id", "status");
