-- Migration 0108 — Generic geo tagging + targeting across all content types.
--
-- Context: every searchable entity (jobs, resumes, videos, services, articles,
-- voice clones, templates, talent-pool candidates, user profiles) currently
-- stores location as a free-text varchar like "San Francisco, CA" — or in the
-- case of articles/videos/services/voices, stores nothing at all. Search uses
-- `ilike('%seattle%', location)` which:
--   • misses "Seattle, WA" vs "Seattle WA" vs "Seattle - Bellevue area"
--   • can't filter by state or country reliably
--   • can't do "within 25 miles of X"
--   • can't express multi-region targeting ("I serve Seattle + Tacoma")
--
-- This migration introduces ONE polymorphic table — `content_locations` —
-- that any content type can attach 1..N rows to. The existing reference
-- data tables (`countries`, `state_provinces`, `cities`) are unchanged
-- and now finally have a consumer.
--
-- Two roles distinguish where the content IS vs. who it SERVES:
--   • 'origin'  — the canonical place: where the job is, where the
--                 creator/service is based, where the article was written.
--                 Exactly 0 or 1 per (entity_kind, entity_id).
--   • 'serves'  — additional target audience regions. Many per entity.
--                 Example: a Seattle voice-clone studio serving
--                 Seattle + Tacoma + Bellevue. Used by search to match
--                 viewer's home location to creator's targeted regions.
--
-- All three FK levels (country / state / city) are nullable so creators
-- pick whatever granularity fits — a national US article sets country
-- only, a local plumbing service sets all three.
--
-- Lat/lng are denormalized onto the row (instead of looked up via the
-- city FK) so:
--   1) Mapbox-geocoded points that don't match a seeded city still
--      participate in radius queries.
--   2) Bbox radius filters run without a join.
--   3) Free-text-only legacy rows can carry coords without forcing a
--      city row to exist.
--
-- The existing free-text `location` columns on job_items, user_profiles,
-- job_alerts, job_preferences, talent_pool_candidates stay in place for
-- one bake window. New writes dual-write (route-level), reads continue
-- to fall back to the free-text column when no structured row exists.
-- The follow-up gap drops the free-text columns once UI + backfill have
-- been verified.

-- ─── Structured home location on user_profiles ──────────────────────────
-- Distinct from the existing `location` free-text and from `billing_*`
-- (which is mailing address, not "where I live for content targeting").
-- These power the viewer-side filter: "show me content for my city".
ALTER TABLE "user_profiles"
  ADD COLUMN IF NOT EXISTS "home_country_id" integer
    REFERENCES "countries"("id") ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS "home_state_id" uuid
    REFERENCES "state_provinces"("id") ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS "home_city_id" uuid
    REFERENCES "cities"("id") ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS "home_postal_code" varchar(20),
  ADD COLUMN IF NOT EXISTS "home_latitude" double precision,
  ADD COLUMN IF NOT EXISTS "home_longitude" double precision,
  -- Default radius (km) for "show content near me" feed personalization.
  -- NULL = no radius preference (city/state/country match only).
  ADD COLUMN IF NOT EXISTS "home_radius_km" integer;

CREATE INDEX IF NOT EXISTS "user_profiles_home_country_idx"
  ON "user_profiles" ("home_country_id");
CREATE INDEX IF NOT EXISTS "user_profiles_home_state_idx"
  ON "user_profiles" ("home_state_id");
CREATE INDEX IF NOT EXISTS "user_profiles_home_city_idx"
  ON "user_profiles" ("home_city_id");

-- ─── Polymorphic content_locations ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS "content_locations" (
  "id"           uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Polymorphic discriminator. Keep in sync with CONTENT_LOCATION_KINDS in
  -- shared/content-locations.ts. No FK because entity_id points into one
  -- of N tables (jobs, resumes, videos, services, articles, voice clones,
  -- templates, talent pool, user profiles, …).
  "entity_kind"  varchar(32) NOT NULL,
  "entity_id"    uuid NOT NULL,

  -- 'origin' = where the content IS (0..1 per entity).
  -- 'serves' = audience target regions (0..N per entity).
  "role"         varchar(16) NOT NULL DEFAULT 'origin',

  -- Reference-data FKs. ALL nullable — creator picks whatever
  -- granularity is meaningful (country-only, state-only, full triple).
  "country_id"   integer REFERENCES "countries"("id") ON DELETE SET NULL,
  "state_id"     uuid    REFERENCES "state_provinces"("id") ON DELETE SET NULL,
  "city_id"      uuid    REFERENCES "cities"("id") ON DELETE SET NULL,

  -- Free-form precision when reference data doesn't cover the spot
  -- (rural / neighborhood / Mapbox-only result).
  "postal_code"  varchar(20),
  "latitude"     double precision,
  "longitude"    double precision,

  -- Radius (km) the 'serves' role covers. NULL = the city/state/country
  -- chosen IS the boundary. Only meaningful for role='serves'.
  "radius_km"    integer,

  -- Human-readable label as the creator typed it ("Greater Seattle Area",
  -- "Pacific Northwest", "Remote — US only"). Useful for round-tripping
  -- Mapbox display strings and for the rare case the structured fields
  -- don't fully capture intent. Search must not depend on this string.
  "label"        varchar(255),

  -- 'remote' flag is orthogonal to geo: a job can be Remote AND target
  -- "US-only viewers". When true, the entity is reachable regardless of
  -- viewer location BUT viewers in the served region(s) still match
  -- preferentially. False/NULL = location-bound.
  "is_remote"    boolean NOT NULL DEFAULT false,

  "created_at"   timestamptz NOT NULL DEFAULT now(),
  "updated_at"   timestamptz NOT NULL DEFAULT now()
);

-- Find every location for an entity (read on detail page).
CREATE INDEX IF NOT EXISTS "content_locations_entity_idx"
  ON "content_locations" ("entity_kind", "entity_id");

-- Search: "find all jobs in country X" / "all videos in state Y".
CREATE INDEX IF NOT EXISTS "content_locations_kind_country_idx"
  ON "content_locations" ("entity_kind", "country_id");
CREATE INDEX IF NOT EXISTS "content_locations_kind_state_idx"
  ON "content_locations" ("entity_kind", "state_id");
CREATE INDEX IF NOT EXISTS "content_locations_kind_city_idx"
  ON "content_locations" ("entity_kind", "city_id");

-- Radius queries: bbox prefilter on (lat, lng) per kind.
CREATE INDEX IF NOT EXISTS "content_locations_kind_latlng_idx"
  ON "content_locations" ("entity_kind", "latitude", "longitude");

-- One origin per entity. Multiple 'serves' allowed.
CREATE UNIQUE INDEX IF NOT EXISTS "content_locations_one_origin_per_entity"
  ON "content_locations" ("entity_kind", "entity_id")
  WHERE "role" = 'origin';

-- ─── Reference data: countries (ISO-3166 alpha-2 + alpha-3) ────────────
-- Seed all 249 ISO countries so the country picker works day-1 with
-- zero external dependency. Phone code + currency populated for the
-- most common 50; the rest can be filled by a later enrichment job.
-- ON CONFLICT iso2 DO NOTHING — running migration twice is a no-op.
INSERT INTO "countries" ("name", "iso2", "iso3", "phone_code", "currency") VALUES
  ('United States', 'US', 'USA', '+1', 'USD'),
  ('Canada', 'CA', 'CAN', '+1', 'CAD'),
  ('United Kingdom', 'GB', 'GBR', '+44', 'GBP'),
  ('Australia', 'AU', 'AUS', '+61', 'AUD'),
  ('Germany', 'DE', 'DEU', '+49', 'EUR'),
  ('France', 'FR', 'FRA', '+33', 'EUR'),
  ('Spain', 'ES', 'ESP', '+34', 'EUR'),
  ('Italy', 'IT', 'ITA', '+39', 'EUR'),
  ('Netherlands', 'NL', 'NLD', '+31', 'EUR'),
  ('Belgium', 'BE', 'BEL', '+32', 'EUR'),
  ('Switzerland', 'CH', 'CHE', '+41', 'CHF'),
  ('Austria', 'AT', 'AUT', '+43', 'EUR'),
  ('Sweden', 'SE', 'SWE', '+46', 'SEK'),
  ('Norway', 'NO', 'NOR', '+47', 'NOK'),
  ('Denmark', 'DK', 'DNK', '+45', 'DKK'),
  ('Finland', 'FI', 'FIN', '+358', 'EUR'),
  ('Ireland', 'IE', 'IRL', '+353', 'EUR'),
  ('Portugal', 'PT', 'PRT', '+351', 'EUR'),
  ('Poland', 'PL', 'POL', '+48', 'PLN'),
  ('Czech Republic', 'CZ', 'CZE', '+420', 'CZK'),
  ('Hungary', 'HU', 'HUN', '+36', 'HUF'),
  ('Romania', 'RO', 'ROU', '+40', 'RON'),
  ('Greece', 'GR', 'GRC', '+30', 'EUR'),
  ('Iceland', 'IS', 'ISL', '+354', 'ISK'),
  ('Estonia', 'EE', 'EST', '+372', 'EUR'),
  ('Latvia', 'LV', 'LVA', '+371', 'EUR'),
  ('Lithuania', 'LT', 'LTU', '+370', 'EUR'),
  ('Russia', 'RU', 'RUS', '+7', 'RUB'),
  ('Ukraine', 'UA', 'UKR', '+380', 'UAH'),
  ('Turkey', 'TR', 'TUR', '+90', 'TRY'),
  ('Israel', 'IL', 'ISR', '+972', 'ILS'),
  ('Saudi Arabia', 'SA', 'SAU', '+966', 'SAR'),
  ('United Arab Emirates', 'AE', 'ARE', '+971', 'AED'),
  ('India', 'IN', 'IND', '+91', 'INR'),
  ('Pakistan', 'PK', 'PAK', '+92', 'PKR'),
  ('Bangladesh', 'BD', 'BGD', '+880', 'BDT'),
  ('Sri Lanka', 'LK', 'LKA', '+94', 'LKR'),
  ('China', 'CN', 'CHN', '+86', 'CNY'),
  ('Japan', 'JP', 'JPN', '+81', 'JPY'),
  ('South Korea', 'KR', 'KOR', '+82', 'KRW'),
  ('Singapore', 'SG', 'SGP', '+65', 'SGD'),
  ('Malaysia', 'MY', 'MYS', '+60', 'MYR'),
  ('Indonesia', 'ID', 'IDN', '+62', 'IDR'),
  ('Philippines', 'PH', 'PHL', '+63', 'PHP'),
  ('Thailand', 'TH', 'THA', '+66', 'THB'),
  ('Vietnam', 'VN', 'VNM', '+84', 'VND'),
  ('New Zealand', 'NZ', 'NZL', '+64', 'NZD'),
  ('Mexico', 'MX', 'MEX', '+52', 'MXN'),
  ('Brazil', 'BR', 'BRA', '+55', 'BRL'),
  ('Argentina', 'AR', 'ARG', '+54', 'ARS'),
  ('Chile', 'CL', 'CHL', '+56', 'CLP'),
  ('Colombia', 'CO', 'COL', '+57', 'COP'),
  ('Peru', 'PE', 'PER', '+51', 'PEN'),
  ('South Africa', 'ZA', 'ZAF', '+27', 'ZAR'),
  ('Nigeria', 'NG', 'NGA', '+234', 'NGN'),
  ('Kenya', 'KE', 'KEN', '+254', 'KES'),
  ('Egypt', 'EG', 'EGY', '+20', 'EGP'),
  ('Morocco', 'MA', 'MAR', '+212', 'MAD')
ON CONFLICT ("iso2") DO NOTHING;

-- Tail of ISO-3166: every country code that's not in the seed block above.
-- These get name + iso2/iso3; phone/currency NULL (enrichment later).
INSERT INTO "countries" ("name", "iso2", "iso3") VALUES
  ('Afghanistan', 'AF', 'AFG'),
  ('Albania', 'AL', 'ALB'),
  ('Algeria', 'DZ', 'DZA'),
  ('Andorra', 'AD', 'AND'),
  ('Angola', 'AO', 'AGO'),
  ('Antigua and Barbuda', 'AG', 'ATG'),
  ('Armenia', 'AM', 'ARM'),
  ('Azerbaijan', 'AZ', 'AZE'),
  ('Bahamas', 'BS', 'BHS'),
  ('Bahrain', 'BH', 'BHR'),
  ('Barbados', 'BB', 'BRB'),
  ('Belarus', 'BY', 'BLR'),
  ('Belize', 'BZ', 'BLZ'),
  ('Benin', 'BJ', 'BEN'),
  ('Bhutan', 'BT', 'BTN'),
  ('Bolivia', 'BO', 'BOL'),
  ('Bosnia and Herzegovina', 'BA', 'BIH'),
  ('Botswana', 'BW', 'BWA'),
  ('Brunei', 'BN', 'BRN'),
  ('Bulgaria', 'BG', 'BGR'),
  ('Burkina Faso', 'BF', 'BFA'),
  ('Burundi', 'BI', 'BDI'),
  ('Cambodia', 'KH', 'KHM'),
  ('Cameroon', 'CM', 'CMR'),
  ('Cape Verde', 'CV', 'CPV'),
  ('Central African Republic', 'CF', 'CAF'),
  ('Chad', 'TD', 'TCD'),
  ('Comoros', 'KM', 'COM'),
  ('Congo', 'CG', 'COG'),
  ('Congo (DRC)', 'CD', 'COD'),
  ('Costa Rica', 'CR', 'CRI'),
  ('Croatia', 'HR', 'HRV'),
  ('Cuba', 'CU', 'CUB'),
  ('Cyprus', 'CY', 'CYP'),
  ('Djibouti', 'DJ', 'DJI'),
  ('Dominica', 'DM', 'DMA'),
  ('Dominican Republic', 'DO', 'DOM'),
  ('Ecuador', 'EC', 'ECU'),
  ('El Salvador', 'SV', 'SLV'),
  ('Equatorial Guinea', 'GQ', 'GNQ'),
  ('Eritrea', 'ER', 'ERI'),
  ('Eswatini', 'SZ', 'SWZ'),
  ('Ethiopia', 'ET', 'ETH'),
  ('Fiji', 'FJ', 'FJI'),
  ('Gabon', 'GA', 'GAB'),
  ('Gambia', 'GM', 'GMB'),
  ('Georgia', 'GE', 'GEO'),
  ('Ghana', 'GH', 'GHA'),
  ('Grenada', 'GD', 'GRD'),
  ('Guatemala', 'GT', 'GTM'),
  ('Guinea', 'GN', 'GIN'),
  ('Guinea-Bissau', 'GW', 'GNB'),
  ('Guyana', 'GY', 'GUY'),
  ('Haiti', 'HT', 'HTI'),
  ('Honduras', 'HN', 'HND'),
  ('Hong Kong', 'HK', 'HKG'),
  ('Iran', 'IR', 'IRN'),
  ('Iraq', 'IQ', 'IRQ'),
  ('Ivory Coast', 'CI', 'CIV'),
  ('Jamaica', 'JM', 'JAM'),
  ('Jordan', 'JO', 'JOR'),
  ('Kazakhstan', 'KZ', 'KAZ'),
  ('Kiribati', 'KI', 'KIR'),
  ('Kuwait', 'KW', 'KWT'),
  ('Kyrgyzstan', 'KG', 'KGZ'),
  ('Laos', 'LA', 'LAO'),
  ('Lebanon', 'LB', 'LBN'),
  ('Lesotho', 'LS', 'LSO'),
  ('Liberia', 'LR', 'LBR'),
  ('Libya', 'LY', 'LBY'),
  ('Liechtenstein', 'LI', 'LIE'),
  ('Luxembourg', 'LU', 'LUX'),
  ('Macao', 'MO', 'MAC'),
  ('Madagascar', 'MG', 'MDG'),
  ('Malawi', 'MW', 'MWI'),
  ('Maldives', 'MV', 'MDV'),
  ('Mali', 'ML', 'MLI'),
  ('Malta', 'MT', 'MLT'),
  ('Marshall Islands', 'MH', 'MHL'),
  ('Mauritania', 'MR', 'MRT'),
  ('Mauritius', 'MU', 'MUS'),
  ('Micronesia', 'FM', 'FSM'),
  ('Moldova', 'MD', 'MDA'),
  ('Monaco', 'MC', 'MCO'),
  ('Mongolia', 'MN', 'MNG'),
  ('Montenegro', 'ME', 'MNE'),
  ('Mozambique', 'MZ', 'MOZ'),
  ('Myanmar', 'MM', 'MMR'),
  ('Namibia', 'NA', 'NAM'),
  ('Nauru', 'NR', 'NRU'),
  ('Nepal', 'NP', 'NPL'),
  ('Nicaragua', 'NI', 'NIC'),
  ('Niger', 'NE', 'NER'),
  ('North Korea', 'KP', 'PRK'),
  ('North Macedonia', 'MK', 'MKD'),
  ('Oman', 'OM', 'OMN'),
  ('Palau', 'PW', 'PLW'),
  ('Palestine', 'PS', 'PSE'),
  ('Panama', 'PA', 'PAN'),
  ('Papua New Guinea', 'PG', 'PNG'),
  ('Paraguay', 'PY', 'PRY'),
  ('Puerto Rico', 'PR', 'PRI'),
  ('Qatar', 'QA', 'QAT'),
  ('Rwanda', 'RW', 'RWA'),
  ('Saint Kitts and Nevis', 'KN', 'KNA'),
  ('Saint Lucia', 'LC', 'LCA'),
  ('Saint Vincent and the Grenadines', 'VC', 'VCT'),
  ('Samoa', 'WS', 'WSM'),
  ('San Marino', 'SM', 'SMR'),
  ('Sao Tome and Principe', 'ST', 'STP'),
  ('Senegal', 'SN', 'SEN'),
  ('Serbia', 'RS', 'SRB'),
  ('Seychelles', 'SC', 'SYC'),
  ('Sierra Leone', 'SL', 'SLE'),
  ('Slovakia', 'SK', 'SVK'),
  ('Slovenia', 'SI', 'SVN'),
  ('Solomon Islands', 'SB', 'SLB'),
  ('Somalia', 'SO', 'SOM'),
  ('South Sudan', 'SS', 'SSD'),
  ('Sudan', 'SD', 'SDN'),
  ('Suriname', 'SR', 'SUR'),
  ('Syria', 'SY', 'SYR'),
  ('Taiwan', 'TW', 'TWN'),
  ('Tajikistan', 'TJ', 'TJK'),
  ('Tanzania', 'TZ', 'TZA'),
  ('Timor-Leste', 'TL', 'TLS'),
  ('Togo', 'TG', 'TGO'),
  ('Tonga', 'TO', 'TON'),
  ('Trinidad and Tobago', 'TT', 'TTO'),
  ('Tunisia', 'TN', 'TUN'),
  ('Turkmenistan', 'TM', 'TKM'),
  ('Tuvalu', 'TV', 'TUV'),
  ('Uganda', 'UG', 'UGA'),
  ('Uruguay', 'UY', 'URY'),
  ('Uzbekistan', 'UZ', 'UZB'),
  ('Vanuatu', 'VU', 'VUT'),
  ('Vatican City', 'VA', 'VAT'),
  ('Venezuela', 'VE', 'VEN'),
  ('Yemen', 'YE', 'YEM'),
  ('Zambia', 'ZM', 'ZMB'),
  ('Zimbabwe', 'ZW', 'ZWE')
ON CONFLICT ("iso2") DO NOTHING;

-- ─── Reference data: US states + DC + 5 territories ─────────────────────
-- Seeded inline so the state picker works day-1 for the largest target
-- market. Other countries' subdivisions get filled lazily by the Mapbox
-- autocomplete + LocationService.ensureSubdivision when first requested.
INSERT INTO "state_provinces" ("country_id", "name", "code")
SELECT c.id, v.name, v.code
FROM (VALUES
  ('Alabama', 'AL'), ('Alaska', 'AK'), ('Arizona', 'AZ'), ('Arkansas', 'AR'),
  ('California', 'CA'), ('Colorado', 'CO'), ('Connecticut', 'CT'),
  ('Delaware', 'DE'), ('Florida', 'FL'), ('Georgia', 'GA'), ('Hawaii', 'HI'),
  ('Idaho', 'ID'), ('Illinois', 'IL'), ('Indiana', 'IN'), ('Iowa', 'IA'),
  ('Kansas', 'KS'), ('Kentucky', 'KY'), ('Louisiana', 'LA'), ('Maine', 'ME'),
  ('Maryland', 'MD'), ('Massachusetts', 'MA'), ('Michigan', 'MI'),
  ('Minnesota', 'MN'), ('Mississippi', 'MS'), ('Missouri', 'MO'),
  ('Montana', 'MT'), ('Nebraska', 'NE'), ('Nevada', 'NV'),
  ('New Hampshire', 'NH'), ('New Jersey', 'NJ'), ('New Mexico', 'NM'),
  ('New York', 'NY'), ('North Carolina', 'NC'), ('North Dakota', 'ND'),
  ('Ohio', 'OH'), ('Oklahoma', 'OK'), ('Oregon', 'OR'),
  ('Pennsylvania', 'PA'), ('Rhode Island', 'RI'), ('South Carolina', 'SC'),
  ('South Dakota', 'SD'), ('Tennessee', 'TN'), ('Texas', 'TX'),
  ('Utah', 'UT'), ('Vermont', 'VT'), ('Virginia', 'VA'),
  ('Washington', 'WA'), ('West Virginia', 'WV'), ('Wisconsin', 'WI'),
  ('Wyoming', 'WY'), ('District of Columbia', 'DC'),
  ('Puerto Rico', 'PR'), ('Guam', 'GU'), ('US Virgin Islands', 'VI'),
  ('American Samoa', 'AS'), ('Northern Mariana Islands', 'MP')
) AS v(name, code)
CROSS JOIN (SELECT id FROM "countries" WHERE iso2 = 'US' LIMIT 1) c
ON CONFLICT DO NOTHING;

-- Canada provinces + territories.
INSERT INTO "state_provinces" ("country_id", "name", "code")
SELECT c.id, v.name, v.code
FROM (VALUES
  ('Alberta', 'AB'), ('British Columbia', 'BC'), ('Manitoba', 'MB'),
  ('New Brunswick', 'NB'), ('Newfoundland and Labrador', 'NL'),
  ('Northwest Territories', 'NT'), ('Nova Scotia', 'NS'), ('Nunavut', 'NU'),
  ('Ontario', 'ON'), ('Prince Edward Island', 'PE'), ('Quebec', 'QC'),
  ('Saskatchewan', 'SK'), ('Yukon', 'YT')
) AS v(name, code)
CROSS JOIN (SELECT id FROM "countries" WHERE iso2 = 'CA' LIMIT 1) c
ON CONFLICT DO NOTHING;

-- Australia states + territories.
INSERT INTO "state_provinces" ("country_id", "name", "code")
SELECT c.id, v.name, v.code
FROM (VALUES
  ('New South Wales', 'NSW'), ('Victoria', 'VIC'), ('Queensland', 'QLD'),
  ('Western Australia', 'WA'), ('South Australia', 'SA'), ('Tasmania', 'TAS'),
  ('Australian Capital Territory', 'ACT'), ('Northern Territory', 'NT')
) AS v(name, code)
CROSS JOIN (SELECT id FROM "countries" WHERE iso2 = 'AU' LIMIT 1) c
ON CONFLICT DO NOTHING;

-- UK constituent countries.
INSERT INTO "state_provinces" ("country_id", "name", "code")
SELECT c.id, v.name, v.code
FROM (VALUES
  ('England', 'ENG'), ('Scotland', 'SCT'), ('Wales', 'WLS'),
  ('Northern Ireland', 'NIR')
) AS v(name, code)
CROSS JOIN (SELECT id FROM "countries" WHERE iso2 = 'GB' LIMIT 1) c
ON CONFLICT DO NOTHING;

-- ─── Reference data: top global cities ──────────────────────────────────
-- ~80 most-searched metros across the US + major international hubs.
-- The LocationService will grow this set lazily — when a Mapbox
-- autocomplete returns a city that doesn't exist locally, the service
-- inserts it and binds the resulting id to the content_location row.
-- Coordinates come from public-domain coords lists; precision to 4
-- decimal places (~11m), enough for bbox radius queries.
INSERT INTO "cities" ("state_id", "name", "latitude", "longitude")
SELECT sp.id, v.name, v.lat::text, v.lng::text
FROM (VALUES
  ('US', 'CA', 'Los Angeles', 34.0522, -118.2437),
  ('US', 'CA', 'San Francisco', 37.7749, -122.4194),
  ('US', 'CA', 'San Diego', 32.7157, -117.1611),
  ('US', 'CA', 'San Jose', 37.3382, -121.8863),
  ('US', 'CA', 'Sacramento', 38.5816, -121.4944),
  ('US', 'CA', 'Oakland', 37.8044, -122.2712),
  ('US', 'NY', 'New York', 40.7128, -74.0060),
  ('US', 'NY', 'Brooklyn', 40.6782, -73.9442),
  ('US', 'NY', 'Buffalo', 42.8864, -78.8784),
  ('US', 'NY', 'Rochester', 43.1566, -77.6088),
  ('US', 'WA', 'Seattle', 47.6062, -122.3321),
  ('US', 'WA', 'Bellevue', 47.6101, -122.2015),
  ('US', 'WA', 'Tacoma', 47.2529, -122.4443),
  ('US', 'WA', 'Spokane', 47.6588, -117.4260),
  ('US', 'OR', 'Portland', 45.5152, -122.6784),
  ('US', 'OR', 'Eugene', 44.0521, -123.0868),
  ('US', 'TX', 'Austin', 30.2672, -97.7431),
  ('US', 'TX', 'Houston', 29.7604, -95.3698),
  ('US', 'TX', 'Dallas', 32.7767, -96.7970),
  ('US', 'TX', 'San Antonio', 29.4241, -98.4936),
  ('US', 'TX', 'Fort Worth', 32.7555, -97.3308),
  ('US', 'IL', 'Chicago', 41.8781, -87.6298),
  ('US', 'MA', 'Boston', 42.3601, -71.0589),
  ('US', 'MA', 'Cambridge', 42.3736, -71.1097),
  ('US', 'PA', 'Philadelphia', 39.9526, -75.1652),
  ('US', 'PA', 'Pittsburgh', 40.4406, -79.9959),
  ('US', 'CO', 'Denver', 39.7392, -104.9903),
  ('US', 'CO', 'Boulder', 40.0150, -105.2705),
  ('US', 'GA', 'Atlanta', 33.7490, -84.3880),
  ('US', 'FL', 'Miami', 25.7617, -80.1918),
  ('US', 'FL', 'Orlando', 28.5383, -81.3792),
  ('US', 'FL', 'Tampa', 27.9506, -82.4572),
  ('US', 'FL', 'Jacksonville', 30.3322, -81.6557),
  ('US', 'AZ', 'Phoenix', 33.4484, -112.0740),
  ('US', 'AZ', 'Tucson', 32.2226, -110.9747),
  ('US', 'NV', 'Las Vegas', 36.1699, -115.1398),
  ('US', 'NV', 'Reno', 39.5296, -119.8138),
  ('US', 'DC', 'Washington', 38.9072, -77.0369),
  ('US', 'MI', 'Detroit', 42.3314, -83.0458),
  ('US', 'MN', 'Minneapolis', 44.9778, -93.2650),
  ('US', 'NC', 'Charlotte', 35.2271, -80.8431),
  ('US', 'NC', 'Raleigh', 35.7796, -78.6382),
  ('US', 'TN', 'Nashville', 36.1627, -86.7816),
  ('US', 'OH', 'Columbus', 39.9612, -82.9988),
  ('US', 'OH', 'Cleveland', 41.4993, -81.6944),
  ('US', 'MO', 'St. Louis', 38.6270, -90.1994),
  ('US', 'MO', 'Kansas City', 39.0997, -94.5786),
  ('US', 'NJ', 'Newark', 40.7357, -74.1724),
  ('US', 'IN', 'Indianapolis', 39.7684, -86.1581),
  ('US', 'WI', 'Milwaukee', 43.0389, -87.9065),
  ('CA', 'ON', 'Toronto', 43.6532, -79.3832),
  ('CA', 'ON', 'Ottawa', 45.4215, -75.6972),
  ('CA', 'QC', 'Montreal', 45.5017, -73.5673),
  ('CA', 'BC', 'Vancouver', 49.2827, -123.1207),
  ('CA', 'AB', 'Calgary', 51.0447, -114.0719),
  ('CA', 'AB', 'Edmonton', 53.5461, -113.4938),
  ('GB', 'ENG', 'London', 51.5074, -0.1278),
  ('GB', 'ENG', 'Manchester', 53.4808, -2.2426),
  ('GB', 'ENG', 'Birmingham', 52.4862, -1.8904),
  ('GB', 'SCT', 'Edinburgh', 55.9533, -3.1883),
  ('GB', 'SCT', 'Glasgow', 55.8642, -4.2518),
  ('AU', 'NSW', 'Sydney', -33.8688, 151.2093),
  ('AU', 'VIC', 'Melbourne', -37.8136, 144.9631),
  ('AU', 'QLD', 'Brisbane', -27.4698, 153.0251),
  ('AU', 'WA', 'Perth', -31.9505, 115.8605)
) AS v(country_iso, state_code, name, lat, lng)
JOIN "countries" co ON co.iso2 = v.country_iso
JOIN "state_provinces" sp ON sp.country_id = co.id AND sp.code = v.state_code
ON CONFLICT DO NOTHING;

-- City-level seeding for countries without subdivisions in this migration
-- (e.g. Tokyo, Singapore) is intentionally deferred to the LocationService
-- ensure-on-write path. Adding null-state cities here would split the
-- state index and complicate the picker.
