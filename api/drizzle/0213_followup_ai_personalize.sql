-- Migration 0213 — AI message personalization opt-in for follow-up steps.
--
-- Adds `ai_personalize` to follow_up_steps. When set, the follow-up cron
-- (scheduled.ts processFollowUps) runs the rendered body through
-- services/outreach/personalize.ts before sending — the "AI message
-- personalization" layer on top of the deterministic {{var}} substitution.
-- Defaults false so every existing step keeps its current behaviour.
--
-- Idempotent per drizzle/TEMPLATE.md.

ALTER TABLE "follow_up_steps"
  ADD COLUMN IF NOT EXISTS "ai_personalize" boolean NOT NULL DEFAULT false;
