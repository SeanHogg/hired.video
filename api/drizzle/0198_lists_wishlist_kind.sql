-- Migration 0198 — Wishlist on the polymorphic Lists system.
--
-- The course marketplace (and, going forward, any marketplace card) gets a
-- heart-toggle "wishlist" affordance. Rather than a second saved-items
-- mechanism, we reuse `lists`/`list_items`: every user has exactly one
-- canonical list with kind = 'wishlist' that backs the heart. Saved courses
-- are list_items with entity_type = 'course'.
--
--   lists.kind              — 'custom' (user-created) | 'wishlist' (the one
--                             canonical per-user heart list).
--   partial unique index    — guarantees at most one wishlist row per owner so
--                             the get-or-create helper is race-safe.
--
-- entity_type = 'course' needs no schema change — list_items.entity_id is
-- already polymorphic; the route layer validates the course exists.
--
-- Idempotent per drizzle/TEMPLATE.md.

ALTER TABLE IF EXISTS "lists"
  ADD COLUMN IF NOT EXISTS "kind" varchar(16) NOT NULL DEFAULT 'custom';

-- At most one wishlist per owner. Partial unique index (no IF NOT EXISTS gap —
-- CREATE UNIQUE INDEX IF NOT EXISTS is supported).
CREATE UNIQUE INDEX IF NOT EXISTS "lists_owner_wishlist_unique_idx"
  ON "lists" ("owner_user_id")
  WHERE "kind" = 'wishlist';
