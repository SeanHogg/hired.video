-- Migration 0122 — Backfill `cover_image_url` for the 14 editorial
-- "So You Want to Become a..." articles seeded by migration 0113. Gap
-- #1226 / pairs with #1225.
--
-- 0113 omitted `cover_image_url` from its INSERT column list so every
-- editorial row landed with NULL. #1225 patched the symptom by routing
-- the on-page hero + the social OG card through `/api/og/articles`,
-- which renders a deterministic SVG seeded by title + category. This
-- migration pins each editorial article's `cover_image_url` to that
-- /api/og/articles URL so:
--   1. JSON-LD `image` consumers (Google rich results, LinkedIn link
--      preview, Slack unfurl) get a non-null value AS IS, without
--      needing the runtime fallback helper.
--   2. The fallback helper's behaviour becomes editor-correctness
--      (only fires for creator-authored articles that haven't uploaded
--      a cover yet) rather than the editorial default.
--
-- When a real photographic cover lands per article (commissioned stock
-- or generated), a future migration overwrites these SVG-fallback URLs
-- with the hosted asset URL. The SVG fallback stays in code for
-- creator articles.
--
-- The URL shape mirrors `articleCoverImageUrl()` in
-- `frontend/lib/seo-ugc.ts` and the API handler in
-- `api/src/routes/og.ts::GET /articles`.

UPDATE "articles"
SET "cover_image_url" = '/api/og/articles?slug=' || "slug"
WHERE "slug" IN (
  'so-you-want-to-become-a-firefighter',
  'so-you-want-to-become-a-police-officer',
  'so-you-want-to-become-an-emt',
  'so-you-want-to-become-a-corrections-officer',
  'so-you-want-to-become-a-cna',
  'so-you-want-to-become-a-phlebotomist',
  'so-you-want-to-become-a-surgical-tech',
  'so-you-want-to-become-an-electrician',
  'so-you-want-to-become-a-plumber',
  'so-you-want-to-become-a-welder',
  'so-you-want-to-become-an-hvac-technician',
  'so-you-want-to-become-a-barber',
  'so-you-want-to-become-a-cosmetologist',
  'so-you-want-to-become-an-esthetician'
)
AND "cover_image_url" IS NULL;
