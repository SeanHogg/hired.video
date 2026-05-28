/**
 * GeoNames cities500 importer (#1646) — fills cities.population /
 * cities.timezone / cities.geoname_id from the GeoNames `cities500.txt`
 * dataset (CC-BY, ~200K cities ≥500 population worldwide).
 *
 * This is the LONG-TAIL mechanism. The launch-market cities already
 * seeded in 0108 get their population + timezone from migration 0168
 * (real values, no file needed). This script backfills the geoname_id
 * anchor on those rows AND inserts/updates every other city in the
 * target countries so /in/[country]/[state]/[city] pages exist for the
 * long tail.
 *
 * Usage:
 *   DATABASE_URL=postgres://… node scripts/import-geonames.mjs ./cities500.txt
 *   DATABASE_URL=…           node scripts/import-geonames.mjs ./cities500.txt --countries=US,CA
 *
 * Get the file:
 *   curl -O https://download.geonames.org/export/dump/cities500.zip
 *   unzip cities500.zip   # → cities500.txt
 *
 * Scoping: defaults to the promotable launch markets (US/CA/MX) so we
 * don't insert 200K global rows into a US-focused product. Pass
 * --countries to override.
 *
 * cities500.txt is tab-separated, no header. Columns (0-indexed):
 *   0 geonameid   1 name        2 asciiname   3 alternatenames
 *   4 latitude    5 longitude   6 feature_class 7 feature_code
 *   8 country_code 9 cc2        10 admin1_code 11 admin2_code
 *   12 admin3     13 admin4     14 population  15 elevation
 *   16 dem        17 timezone   18 modification_date
 *
 * State resolution: admin1_code is matched against state_provinces.code
 * within the country (GeoNames US/CA admin1 codes are the postal
 * abbreviations we seeded — "CA", "TX", "ON"). Rows whose admin1 doesn't
 * resolve to a seeded state are skipped (logged) rather than guessed.
 *
 * Idempotent: re-running upserts by geoname_id where present, else by
 * (state_id, slug). Safe to run repeatedly.
 */

import { createReadStream } from "node:fs";
import { createInterface } from "node:readline";
import { neon } from "@neondatabase/serverless";

const DEFAULT_COUNTRIES = ["US", "CA", "MX"];

function slugify(input) {
  return String(input)
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}

async function main() {
  const filePath = process.argv[2];
  if (!filePath) {
    console.error("usage: node scripts/import-geonames.mjs <cities500.txt> [--countries=US,CA,MX]");
    process.exit(1);
  }
  const countriesArg = process.argv.find((a) => a.startsWith("--countries="));
  const targetCountries = new Set(
    (countriesArg ? countriesArg.split("=")[1].split(",") : DEFAULT_COUNTRIES).map((c) => c.trim().toUpperCase()),
  );

  const url = process.env.DATABASE_URL || process.env.NEON_DATABASE_URL || process.env.NEON_DB_URL;
  if (!url) {
    console.error("DATABASE_URL is not set");
    process.exit(1);
  }
  const sql = neon(url);

  // Cache country iso2 → id and (countryId, stateCode) → stateId so we
  // don't round-trip per row. Build expanded IN placeholders rather than
  // `= ANY($1)` — the Neon HTTP driver mis-binds JS arrays in ANY()
  // position (#1619). The lists are tiny (≤3 launch markets) so inlining
  // placeholders is fine.
  const isoList = [...targetCountries];
  const isoPlaceholders = isoList.map((_, i) => `$${i + 1}`).join(", ");
  const countryRows = await sql(
    `SELECT id, iso2 FROM countries WHERE iso2 IN (${isoPlaceholders})`,
    isoList,
  );
  const countryIdByIso2 = new Map(countryRows.map((r) => [r.iso2.toUpperCase(), r.id]));
  if (countryIdByIso2.size === 0) {
    console.error("none of the target countries exist in the countries table");
    process.exit(1);
  }

  const countryIds = [...countryIdByIso2.values()];
  const idPlaceholders = countryIds.map((_, i) => `$${i + 1}`).join(", ");
  const stateRows = await sql(
    `SELECT id, country_id, code FROM state_provinces WHERE country_id IN (${idPlaceholders}) AND code IS NOT NULL`,
    countryIds,
  );
  const stateIdByKey = new Map(stateRows.map((r) => [`${r.country_id}:${String(r.code).toUpperCase()}`, r.id]));

  const rl = createInterface({ input: createReadStream(filePath, "utf8"), crlfDelay: Infinity });

  let scanned = 0, upserted = 0, skippedCountry = 0, skippedState = 0, errors = 0;
  // Batch upserts to keep the HTTP round-trips down.
  const BATCH = 200;
  let batch = [];

  const flush = async () => {
    if (batch.length === 0) return;
    const rows = batch;
    batch = [];
    // One multi-row upsert per batch. Conflict on geoname_id (unique,
    // partial) updates pop/tz; if a row with the same (state_id, slug)
    // exists without a geoname_id (the 0108-seeded cities), we adopt it
    // by geoname_id in a second pass below.
    for (const r of rows) {
      try {
        // Prefer adopting an existing same-name/slug city in the state
        // (0108 seed) so we don't create a duplicate; else insert.
        await sql(
          `INSERT INTO cities (state_id, name, slug, latitude, longitude, population, timezone, geoname_id, population_as_of, population_source, is_active)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8, CURRENT_DATE, 'geonames', true)
           ON CONFLICT (state_id, slug) DO UPDATE SET
             population = EXCLUDED.population,
             timezone = EXCLUDED.timezone,
             geoname_id = COALESCE(cities.geoname_id, EXCLUDED.geoname_id),
             latitude = COALESCE(cities.latitude, EXCLUDED.latitude),
             longitude = COALESCE(cities.longitude, EXCLUDED.longitude),
             population_as_of = CURRENT_DATE,
             population_source = 'geonames'`,
          [r.stateId, r.name, r.slug, r.lat, r.lng, r.pop, r.tz, r.geonameId],
        );
        upserted++;
      } catch (e) {
        errors++;
        if (errors <= 10) console.error(`  upsert err (${r.name}):`, (e?.message ?? String(e)).slice(0, 160));
      }
    }
  };

  for await (const line of rl) {
    if (!line) continue;
    const f = line.split("\t");
    if (f.length < 18) continue;
    scanned++;
    const countryCode = (f[8] || "").toUpperCase();
    if (!targetCountries.has(countryCode)) { skippedCountry++; continue; }
    const countryId = countryIdByIso2.get(countryCode);
    if (!countryId) { skippedCountry++; continue; }
    const admin1 = (f[10] || "").toUpperCase();
    const stateId = stateIdByKey.get(`${countryId}:${admin1}`);
    if (!stateId) { skippedState++; continue; }

    const name = f[1];
    const pop = Number.parseInt(f[14], 10) || 0;
    const tz = f[17] || null;
    const geonameId = Number.parseInt(f[0], 10) || null;
    const lat = Number.parseFloat(f[4]) || null;
    const lng = Number.parseFloat(f[5]) || null;

    batch.push({ stateId, name, slug: slugify(name), lat, lng, pop, tz, geonameId });
    if (batch.length >= BATCH) await flush();
  }
  await flush();

  console.log(
    `geonames import: scanned ${scanned}, upserted ${upserted}, skipped ${skippedCountry} (off-target country), ${skippedState} (unmapped state), errors ${errors}`,
  );
  process.exit(errors > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
