-- Migration 0202 — SuperAdmin-curated dashboard feed (per role).
--
-- The empty job-seeker dashboard (and every other role's) fills from a set
-- of cards a SuperAdmin pins here: tools (Career 360), pages (the Chrome
-- extension), articles, videos, jobs, resumes — anything renderable as a
-- card. Storage is polymorphic, mirroring content_locations: one row points
-- at one (entity_kind, entity_id) tuple.
--
-- entity_id is a free VARCHAR, not a UUID, because the curated set spans
-- DB entities (uuid ids) AND static catalogue entries (tool / page slugs).
--
-- The card is rendered from the embed_payload snapshot (taken at curation
-- time, same trick as feed_posts.embed_payload) so the dashboard read never
-- N+1s back to the source table.
--
-- roles is a JSONB array of USER_ROLE strings; an empty array means "every
-- role" (a global feature). rank orders the cards (lower sorts first).
--
-- See shared/feed-features.ts for the SSoT enums + payload shape.
-- Idempotent per drizzle/TEMPLATE.md.

CREATE TABLE IF NOT EXISTS feed_features (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Polymorphic discriminator + id (see FEED_FEATURE_KINDS).
  entity_kind   VARCHAR(32)  NOT NULL,
  entity_id     VARCHAR(128) NOT NULL,
  -- Target roles (JSONB string array). [] = show to every role.
  roles         JSONB        NOT NULL DEFAULT '[]'::jsonb,
  -- Denormalised label for the admin list (the embed_payload also carries it).
  title         VARCHAR(500) NOT NULL DEFAULT '',
  -- RawApiItem snapshot the card factory renders from.
  embed_payload JSONB        NOT NULL DEFAULT '{}'::jsonb,
  -- Curation order; lower sorts first.
  rank          INTEGER      NOT NULL DEFAULT 0,
  is_active     BOOLEAN      NOT NULL DEFAULT true,
  created_by    UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- One feature per entity — POST upserts on this constraint (roles array
-- handles multi-role targeting, so an entity is pinned at most once).
CREATE UNIQUE INDEX IF NOT EXISTS uq_feed_features_entity
  ON feed_features (entity_kind, entity_id);

-- The dashboard read loads active rows ordered by rank.
CREATE INDEX IF NOT EXISTS idx_feed_features_active_rank
  ON feed_features (is_active, rank);
