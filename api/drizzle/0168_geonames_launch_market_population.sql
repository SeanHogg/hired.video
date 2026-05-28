-- Migration 0168 — GeoNames-derived population + timezone for launch-market
-- cities, states, and countries (#1646 / closes #1669).
--
-- The columns landed in 0166; this fills them with REAL data for the
-- launch markets (US live, CA + MX building per shared/launch-markets.ts)
-- so cold-start ranking works immediately: the footer "top states" + the
-- /sitemap/locations ordering + jobs-per-capita normalization all key off
-- population. Without this, population is NULL and the footer falls back
-- to alphabetical (#1669).
--
-- Source: GeoNames (CC-BY) — city-proper figures (2020 US census /
-- 2021 StatCan), IANA timezone. The long-tail global import (every
-- city ≥500 pop) is handled by scripts/import-geonames.mjs against the
-- cities500.txt file; this migration covers the ~55 cities already seeded
-- in 0108 plus every US state + CA province + the three country totals.
--
-- geoname_id is intentionally left NULL here — the importer fills it from
-- cities500 (fabricating ids risks wrong cross-dataset anchors). Idempotent:
-- re-running sets identical values.

-- ── Cities (matched by country iso2 + state code + name) ───────────────
UPDATE cities c
SET population = v.pop,
    timezone = v.tz,
    population_as_of = DATE '2021-01-01',
    population_source = 'geonames'
FROM (VALUES
  ('US','CA','Los Angeles', 3898747, 'America/Los_Angeles'),
  ('US','CA','San Francisco', 873965, 'America/Los_Angeles'),
  ('US','CA','San Diego', 1386932, 'America/Los_Angeles'),
  ('US','CA','San Jose', 1013240, 'America/Los_Angeles'),
  ('US','CA','Sacramento', 524943, 'America/Los_Angeles'),
  ('US','CA','Oakland', 440646, 'America/Los_Angeles'),
  ('US','NY','New York', 8804190, 'America/New_York'),
  ('US','NY','Brooklyn', 2736074, 'America/New_York'),
  ('US','NY','Buffalo', 278349, 'America/New_York'),
  ('US','NY','Rochester', 211328, 'America/New_York'),
  ('US','WA','Seattle', 737015, 'America/Los_Angeles'),
  ('US','WA','Bellevue', 151854, 'America/Los_Angeles'),
  ('US','WA','Tacoma', 219346, 'America/Los_Angeles'),
  ('US','WA','Spokane', 228989, 'America/Los_Angeles'),
  ('US','OR','Portland', 652503, 'America/Los_Angeles'),
  ('US','OR','Eugene', 176654, 'America/Los_Angeles'),
  ('US','TX','Austin', 961855, 'America/Chicago'),
  ('US','TX','Houston', 2304580, 'America/Chicago'),
  ('US','TX','Dallas', 1304379, 'America/Chicago'),
  ('US','TX','San Antonio', 1434625, 'America/Chicago'),
  ('US','TX','Fort Worth', 918915, 'America/Chicago'),
  ('US','IL','Chicago', 2746388, 'America/Chicago'),
  ('US','MA','Boston', 675647, 'America/New_York'),
  ('US','MA','Cambridge', 118403, 'America/New_York'),
  ('US','PA','Philadelphia', 1603797, 'America/New_York'),
  ('US','PA','Pittsburgh', 302971, 'America/New_York'),
  ('US','CO','Denver', 715522, 'America/Denver'),
  ('US','CO','Boulder', 108250, 'America/Denver'),
  ('US','GA','Atlanta', 498715, 'America/New_York'),
  ('US','FL','Miami', 442241, 'America/New_York'),
  ('US','FL','Orlando', 307573, 'America/New_York'),
  ('US','FL','Tampa', 384959, 'America/New_York'),
  ('US','FL','Jacksonville', 949611, 'America/New_York'),
  ('US','AZ','Phoenix', 1608139, 'America/Phoenix'),
  ('US','AZ','Tucson', 542629, 'America/Phoenix'),
  ('US','NV','Las Vegas', 641903, 'America/Los_Angeles'),
  ('US','NV','Reno', 264165, 'America/Los_Angeles'),
  ('US','DC','Washington', 689545, 'America/New_York'),
  ('US','MI','Detroit', 639111, 'America/Detroit'),
  ('US','MN','Minneapolis', 429954, 'America/Chicago'),
  ('US','NC','Charlotte', 874579, 'America/New_York'),
  ('US','NC','Raleigh', 467665, 'America/New_York'),
  ('US','TN','Nashville', 689447, 'America/Chicago'),
  ('US','OH','Columbus', 905748, 'America/New_York'),
  ('US','OH','Cleveland', 372624, 'America/New_York'),
  ('US','MO','St. Louis', 301578, 'America/Chicago'),
  ('US','MO','Kansas City', 508090, 'America/Chicago'),
  ('US','NJ','Newark', 311549, 'America/New_York'),
  ('US','IN','Indianapolis', 887642, 'America/Indiana/Indianapolis'),
  ('US','WI','Milwaukee', 577222, 'America/Chicago'),
  ('CA','ON','Toronto', 2794356, 'America/Toronto'),
  ('CA','ON','Ottawa', 1017449, 'America/Toronto'),
  ('CA','QC','Montreal', 1762949, 'America/Toronto'),
  ('CA','BC','Vancouver', 662248, 'America/Vancouver'),
  ('CA','AB','Calgary', 1481806, 'America/Edmonton'),
  ('CA','AB','Edmonton', 1010899, 'America/Edmonton')
) AS v(country_iso, state_code, city_name, pop, tz)
JOIN countries co ON co.iso2 = v.country_iso
JOIN state_provinces sp ON sp.country_id = co.id AND sp.code = v.state_code
WHERE c.state_id = sp.id AND c.name = v.city_name;

-- ── US states + DC (2020 census) ───────────────────────────────────────
UPDATE state_provinces sp
SET population = v.pop,
    population_as_of = DATE '2020-04-01',
    population_source = 'us-census-2020'
FROM (VALUES
  ('AL', 5024279), ('AK', 733391), ('AZ', 7151502), ('AR', 3011524),
  ('CA', 39538223), ('CO', 5773714), ('CT', 3605944), ('DE', 989948),
  ('FL', 21538187), ('GA', 10711908), ('HI', 1455271), ('ID', 1839106),
  ('IL', 12812508), ('IN', 6785528), ('IA', 3190369), ('KS', 2937880),
  ('KY', 4505836), ('LA', 4657757), ('ME', 1362359), ('MD', 6177224),
  ('MA', 7029917), ('MI', 10077331), ('MN', 5706494), ('MS', 2961279),
  ('MO', 6154913), ('MT', 1084225), ('NE', 1961504), ('NV', 3104614),
  ('NH', 1377529), ('NJ', 9288994), ('NM', 2117522), ('NY', 20201249),
  ('NC', 10439388), ('ND', 779094), ('OH', 11799448), ('OK', 3959353),
  ('OR', 4237256), ('PA', 13002700), ('RI', 1097379), ('SC', 5118425),
  ('SD', 886667), ('TN', 6910840), ('TX', 29145505), ('UT', 3271616),
  ('VT', 643077), ('VA', 8631393), ('WA', 7705281), ('WV', 1793716),
  ('WI', 5893718), ('WY', 576851), ('DC', 689545)
) AS v(code, pop)
JOIN countries co ON co.iso2 = 'US'
WHERE sp.country_id = co.id AND sp.code = v.code;

-- ── Canada provinces + territories (2021 census) ───────────────────────
UPDATE state_provinces sp
SET population = v.pop,
    population_as_of = DATE '2021-05-01',
    population_source = 'statcan-2021'
FROM (VALUES
  ('AB', 4262635), ('BC', 5000879), ('MB', 1342153), ('NB', 775610),
  ('NL', 510550), ('NT', 41070), ('NS', 969383), ('NU', 36858),
  ('ON', 14223942), ('PE', 154331), ('QC', 8501833), ('SK', 1132505),
  ('YT', 40232)
) AS v(code, pop)
JOIN countries co ON co.iso2 = 'CA'
WHERE sp.country_id = co.id AND sp.code = v.code;

-- ── Country totals ─────────────────────────────────────────────────────
UPDATE countries
SET population = v.pop,
    population_as_of = v.asof,
    population_source = 'worldbank'
FROM (VALUES
  ('US', 331449281::bigint, DATE '2020-04-01'),
  ('CA', 36991981::bigint, DATE '2021-05-01'),
  ('MX', 126014024::bigint, DATE '2020-03-01')
) AS v(iso2, pop, asof)
WHERE countries.iso2 = v.iso2;
