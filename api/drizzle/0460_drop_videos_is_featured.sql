-- Migration 0460 — drop the dead `videos.is_featured` column (gap #754).
--
-- Migration 0091 moved the homepage-carousel flag onto
-- `studio_projects.is_featured` (the v2-NLE source of truth — those
-- projects render live off `timelineSpec` and never have a `videos`
-- row). 0091 also backfilled any `videos.is_featured = true` rows onto
-- their linked project. Every remaining read of `videos.is_featured`
-- has been removed from the app, so the legacy column is now unread.
--
-- Idempotent per drizzle/TEMPLATE.md (rule 4: DROP COLUMN uses IF EXISTS).

ALTER TABLE videos DROP COLUMN IF EXISTS is_featured;
