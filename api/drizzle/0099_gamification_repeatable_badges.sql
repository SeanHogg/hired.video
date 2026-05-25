-- Phase 6: repeatable badges + new badges (first_post, get_it_done, on_fire) + streak milestones at 7/14/30/60/90.
--
-- Streak badges can be earned every time the user rebuilds the streak from
-- zero. The unique (user_id, badge_id) constraint blocked this; we drop it
-- so user_badges becomes a true earnings log (one row per earn). Non-
-- repeatable badges (first_task etc.) keep their once-per-user semantics
-- via an application-level pre-insert check in `awardBadgeOnce`.

DROP INDEX IF EXISTS "user_badges_user_badge_uniq";

ALTER TABLE "badges"
  ADD COLUMN IF NOT EXISTS "is_repeatable" boolean NOT NULL DEFAULT false;

-- Rename `first_task` → `get_it_done` per product language.
UPDATE "badges"
   SET slug='get_it_done',
       name='Get It Done',
       description='Completed your first task.'
 WHERE slug='first_task';

-- Rename `streak_7` → `on_fire` per product language; mark repeatable.
UPDATE "badges"
   SET slug='on_fire',
       name='On Fire',
       description='Stayed active 7 days in a row.',
       is_repeatable=true
 WHERE slug='streak_7';

-- Mark streak_30 repeatable.
UPDATE "badges"
   SET is_repeatable=true
 WHERE slug='streak_30';

-- Add new streak rungs (14 / 60 / 90), all repeatable. Eligible across
-- all three scoring roles since the streak signal fires for everyone now.
INSERT INTO "badges" (slug, name, description, tier, icon_key, points_reward, roles, is_repeatable) VALUES
  ('streak_14', 'Fortnight Force', '14-day activity streak.', 'silver', 'flame', 150, '["job_seeker","recruiter","employer"]'::jsonb, true),
  ('streak_60', 'Unstoppable',    '60-day activity streak.', 'gold',   'flame', 1000, '["job_seeker","recruiter","employer"]'::jsonb, true),
  ('streak_90', 'Legendary',      '90-day activity streak.', 'gold',   'flame', 2000, '["job_seeker","recruiter","employer"]'::jsonb, true)
ON CONFLICT (slug) DO NOTHING;

-- First-time post on the social feed (one-time badge).
INSERT INTO "badges" (slug, name, description, tier, icon_key, points_reward, roles) VALUES
  ('first_post', 'First Time Post', 'Shared your first post on the feed.', 'bronze', 'megaphone', 25, '["job_seeker","recruiter","employer"]'::jsonb)
ON CONFLICT (slug) DO NOTHING;

-- Widen existing single-role badges to all three scoring roles now that
-- recruiter + employer have catalog entries.
UPDATE "badges"
   SET roles='["job_seeker","recruiter","employer"]'::jsonb
 WHERE slug IN ('on_fire','streak_30','get_it_done','ai_tool_first','purchase_first','hundred_tasks');
