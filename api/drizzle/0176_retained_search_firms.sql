-- Migration 0176 — Retained-search recruiter directory (#1675).
-- (Renumbered from 0172 after external migrations claimed that slot.)
--
-- A curated reference directory of retained executive-search firms for
-- the senior-exec audience. Retained search (paid upfront, exclusive)
-- is distinct from the contingent bidding marketplace. Seeded with
-- well-known firms; admins extend over time.
--
-- Idempotent: CREATE TABLE IF NOT EXISTS + INSERT … ON CONFLICT (slug)
-- DO NOTHING.

CREATE TABLE IF NOT EXISTS "retained_search_firms" (
  "id"          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "name"        varchar(200) NOT NULL,
  "slug"        varchar(120) NOT NULL,
  "description" text,
  "website"     varchar(255),
  "contact_url" varchar(255),
  "logo_url"    varchar(255),
  "tier"        varchar(24) NOT NULL DEFAULT 'global',
  "specialties" jsonb DEFAULT '[]'::jsonb,
  "regions"     jsonb DEFAULT '[]'::jsonb,
  "sort_order"  integer NOT NULL DEFAULT 100,
  "is_active"   boolean NOT NULL DEFAULT true,
  "created_at"  timestamptz NOT NULL DEFAULT now(),
  "updated_at"  timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "retained_search_firms_slug_uniq"
  ON "retained_search_firms" ("slug");
CREATE INDEX IF NOT EXISTS "retained_search_firms_active_tier_idx"
  ON "retained_search_firms" ("is_active", "tier", "sort_order");

INSERT INTO "retained_search_firms"
  ("name", "slug", "description", "website", "tier", "specialties", "regions", "sort_order")
VALUES
  ('Korn Ferry', 'korn-ferry', 'Global organizational consulting + executive search across all functions and industries.', 'https://www.kornferry.com', 'global', '["technology","financial-services","life-sciences","industrial","consumer"]'::jsonb, '["US","CA","GB","AU","MX"]'::jsonb, 10),
  ('Heidrick & Struggles', 'heidrick-struggles', 'Premier C-suite and board search, leadership assessment, and culture shaping.', 'https://www.heidrick.com', 'global', '["ceo","board","technology","financial-services","healthcare"]'::jsonb, '["US","CA","GB","AU"]'::jsonb, 20),
  ('Russell Reynolds Associates', 'russell-reynolds', 'Senior-level executive search and leadership advisory for the world''s largest organizations.', 'https://www.russellreynolds.com', 'global', '["ceo","board","digital","sustainability"]'::jsonb, '["US","CA","GB","AU"]'::jsonb, 30),
  ('Spencer Stuart', 'spencer-stuart', 'Leading senior-executive and board search firm; deep CEO and board practice.', 'https://www.spencerstuart.com', 'global', '["ceo","board","cmo","cfo","technology"]'::jsonb, '["US","CA","GB","AU"]'::jsonb, 40),
  ('Egon Zehnder', 'egon-zehnder', 'Privately held leadership advisory and executive search with a one-firm partnership model.', 'https://www.egonzehnder.com', 'global', '["ceo","board","family-business","private-equity"]'::jsonb, '["US","CA","GB"]'::jsonb, 50),
  ('Boyden', 'boyden', 'Global executive search, interim management, and leadership consulting.', 'https://www.boyden.com', 'global', '["interim","technology","industrial","nonprofit"]'::jsonb, '["US","CA","GB","MX"]'::jsonb, 60),
  ('DHR Global', 'dhr-global', 'Privately held global executive search and leadership consulting firm.', 'https://www.dhrglobal.com', 'global', '["financial-services","healthcare","industrial","technology"]'::jsonb, '["US","CA","MX"]'::jsonb, 70),
  ('Odgers Berndtson', 'odgers-berndtson', 'Global executive search and leadership assessment across public and private sectors.', 'https://www.odgersberndtson.com', 'global', '["public-sector","technology","financial-services"]'::jsonb, '["US","CA","GB"]'::jsonb, 80),
  ('True Search', 'true-search', 'Tech-enabled executive search firm focused on high-growth and venture-backed companies.', 'https://www.true.global', 'boutique', '["technology","venture-backed","go-to-market","product"]'::jsonb, '["US","GB"]'::jsonb, 90),
  ('Daversa Partners', 'daversa-partners', 'Executive search built for venture-backed and growth-stage technology companies.', 'https://www.daversapartners.com', 'boutique', '["technology","venture-backed","startup","ceo"]'::jsonb, '["US"]'::jsonb, 100),
  ('Riviera Partners', 'riviera-partners', 'Executive search specializing in engineering, product, and design leadership.', 'https://www.rivierapartners.com', 'boutique', '["engineering","product","design","technology"]'::jsonb, '["US"]'::jsonb, 110),
  ('Caldwell', 'caldwell', 'Global executive search firm placing senior leaders and boards across industries.', 'https://www.caldwell.com', 'regional', '["financial-services","technology","industrial","board"]'::jsonb, '["US","CA"]'::jsonb, 120)
ON CONFLICT ("slug") DO NOTHING;
