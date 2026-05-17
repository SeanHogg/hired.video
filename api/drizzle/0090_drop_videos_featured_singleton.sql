-- 0090 — Drop the homepage-featured singleton constraint.
--
-- Migration 0088 enforced "exactly one is_featured=true row" via the
-- partial unique index `uq_videos_is_featured_singleton`. The product
-- pivoted: SuperAdmin now curates a *set* of featured videos that the
-- homepage `HeroVideoSpotlight` rotates through as a carousel, so we
-- need to allow N>1 rows.
--
-- Existing rows are preserved as-is — any video that was the singleton
-- is still is_featured=true. The carousel orders by
-- `desc(is_featured), desc(updated_at)` so the most-recently-promoted
-- video leads.
--
-- Public hero feed `GET /api/studio/videos/featured` was added in this
-- same change to filter the carousel to is_featured=true rows only,
-- replacing the previous "all public, featured leading" feed for the
-- hero card. `GET /api/studio/videos/public` remains for surfaces that
-- want the discovery list (card-feed, etc).

DROP INDEX IF EXISTS uq_videos_is_featured_singleton;
