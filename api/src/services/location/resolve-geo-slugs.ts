/**
 * resolveGeoSlugs — the ONE place that turns `/in`-style geo slugs into
 * canonical reference rows (#1833). Country matches iso2 / iso3 / slugified
 * name; state matches code / slugified name within the country; city matches
 * `cities.slug` within the state. Pure DB lookups (no HTTP), so it is shared by
 * BOTH the `/api/locations/resolve` route AND the community-resources submit +
 * directory-query paths — both canonicalize identically, which is exactly what
 * the international parity fix needs (a state submitted as "texas" and a `/in`
 * URL of "tx" resolve to the SAME `state.id`).
 *
 * Returns the full rows (id + display fields) so the resolve route can build
 * its response unchanged, while the community paths read just the ids.
 */
import { and, eq, sql } from "drizzle-orm";
import { schema } from "../../db/index.js";

const { countries, stateProvinces, cities } = schema;

export interface ResolvedGeo {
  country: { id: number; name: string; iso2: string };
  state: { id: string; name: string; code: string | null } | null;
  city: { id: string; name: string; slug: string } | null;
}

/** Flat result (not a discriminated union) so every field is accessible at the
 *  call site without control-flow narrowing: `geo` is non-null on success;
 *  `failed`/`reason` describe the miss otherwise. */
export interface GeoResolveResult {
  geo: ResolvedGeo | null;
  failed: "country" | "state" | "city" | null;
  reason: string | null;
}

const fail = (failed: "country" | "state" | "city", reason: string): GeoResolveResult => ({
  geo: null,
  failed,
  reason,
});

export async function resolveGeoSlugs(
  db: any,
  input: { country: string; state?: string | null; city?: string | null },
): Promise<GeoResolveResult> {
  const countrySlug = (input.country ?? "").trim().toLowerCase();
  const stateSlug = (input.state ?? "").trim().toLowerCase();
  const citySlug = (input.city ?? "").trim().toLowerCase();
  if (!countrySlug) return fail("country", "country is required");

  // Country: iso2 (2 chars), iso3 (3 chars), or slugified name.
  let countryRow: { id: number; name: string; iso2: string } | null = null;
  if (countrySlug.length === 2) {
    const [r] = await db
      .select({ id: countries.id, name: countries.name, iso2: countries.iso2 })
      .from(countries)
      .where(and(eq(sql`lower(${countries.iso2})`, countrySlug), eq(countries.isActive, true)))
      .limit(1);
    countryRow = r ?? null;
  } else if (countrySlug.length === 3) {
    const [r] = await db
      .select({ id: countries.id, name: countries.name, iso2: countries.iso2 })
      .from(countries)
      .where(and(eq(sql`lower(${countries.iso3})`, countrySlug), eq(countries.isActive, true)))
      .limit(1);
    countryRow = r ?? null;
  }
  if (!countryRow) {
    const [r] = await db
      .select({ id: countries.id, name: countries.name, iso2: countries.iso2 })
      .from(countries)
      .where(
        and(
          eq(sql`lower(regexp_replace(${countries.name}, '[^a-zA-Z0-9]+', '-', 'g'))`, countrySlug),
          eq(countries.isActive, true),
        ),
      )
      .limit(1);
    countryRow = r ?? null;
  }
  if (!countryRow) return fail("country", "country not found");

  // State: lowercased code OR slugified name within country.
  let stateRow: { id: string; name: string; code: string | null } | null = null;
  if (stateSlug) {
    const [r] = await db
      .select({ id: stateProvinces.id, name: stateProvinces.name, code: stateProvinces.code })
      .from(stateProvinces)
      .where(
        and(
          eq(stateProvinces.countryId, countryRow.id),
          sql`(lower(${stateProvinces.code}) = ${stateSlug}
               OR lower(regexp_replace(${stateProvinces.name}, '[^a-zA-Z0-9]+', '-', 'g')) = ${stateSlug})`,
          eq(stateProvinces.isActive, true),
        ),
      )
      .limit(1);
    if (!r) return fail("state", "state not found");
    stateRow = r;
  }

  // City: cities.slug within state.
  let cityRow: { id: string; name: string; slug: string } | null = null;
  if (citySlug) {
    if (!stateRow) return fail("city", "city requires state");
    const [r] = await db
      .select({ id: cities.id, name: cities.name, slug: cities.slug })
      .from(cities)
      .where(and(eq(cities.stateId, stateRow.id), eq(cities.slug, citySlug), eq(cities.isActive, true)))
      .limit(1);
    if (!r) return fail("city", "city not found");
    cityRow = r;
  }

  return { geo: { country: countryRow, state: stateRow, city: cityRow }, failed: null, reason: null };
}
