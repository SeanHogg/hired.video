-- #1952 — badge seeds for peer resume feedback (career coaching / feedback loop).
--
-- The ACTIONS.* catalog rules + the badge-engine considerBadge() cases live in
-- api/src/domains/gamification/{rules,badge-engine}.ts. This migration seeds the
-- badge *rows* the new slugs resolve to — the badge engine looks each up by slug
-- (findBadgeBySlug) at unlock time, so a case with no seeded row is a silent
-- no-op. These rows make the "First Feedback" + "Mentor" badges real.
--
-- Eligible across every scoring role (anyone can review a peer's resume).
-- ON CONFLICT (slug) DO NOTHING so the SQL runner can re-apply idempotently.

INSERT INTO "badges" (slug, name, description, tier, icon_key, points_reward, roles, is_repeatable) VALUES
  ('feedback_first', 'First Feedback', 'Submitted your first resume review.',         'bronze', 'message-square', 40,  '["job_seeker","recruiter","employer","creator"]'::jsonb, false),
  ('mentor',         'Mentor',         'Completed five resume reviews for others.',   'gold',   'graduation-cap', 500, '["job_seeker","recruiter","employer","creator"]'::jsonb, false)
ON CONFLICT (slug) DO NOTHING;
