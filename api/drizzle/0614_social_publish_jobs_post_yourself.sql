-- 0614_social_publish_jobs_post_yourself.sql
--
-- W3-D1. `post_settings->>'postYourself'` (the agent draft the user must post
-- by hand) was filtered in listAgentDrafts via a JSONB cast. Promote it to a
-- typed boolean; every reader and writer now uses the column and the JSON key
-- is no longer written (nothing outside the API read it). Existing JSON is
-- left in place. Idempotent.

ALTER TABLE social_publish_jobs ADD COLUMN IF NOT EXISTS post_yourself boolean NOT NULL DEFAULT false;

UPDATE social_publish_jobs
SET post_yourself = true
WHERE post_yourself = false
  AND jsonb_typeof(post_settings) = 'object'
  AND post_settings->>'postYourself' = 'true';
