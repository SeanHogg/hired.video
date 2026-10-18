/**
 * LocationReferenceRepository — batch reads/writes for the geo reference
 * tables (countries / state_provinces / cities) used when the geocoder
 * returns places we may not have yet.
 *
 * Every method is set-shaped (inArray / multi-row insert) so resolving a
 * page of autocomplete hits costs a fixed number of round-trips instead
 * of several per place.
 */
import { and, asc, eq, ilike, inArray, like, or, sql } from "drizzle-orm";
import { schema } from "../db/index.js";

const { countries, stateProvinces, cities } = schema;

export type DbLike = any;

export interface StateRefRow {
  id: string;
  countryId: number;
  name: string;
  code: string | null;
}

export interface CityRefRow {
  id: string;
  stateId: string;
  name: string;
}

export interface CountryListRow {
  id: number;
  name: string;
  iso2: string;
  iso3: string | null;
  phoneCode: string | null;
  currency: string | null;
}

export interface StateListRow {
  id: string;
  name: string;
  code: string | null;
  countryId: number;
}

export interface CityListRow {
  id: string;
  name: string;
  stateId: string;
  latitude: number | null;
  longitude: number | null;
}

/** One flattened country → state → city row of the sitemap tree query. */
export interface LocationTreeRow {
  countryId: number;
  countryName: string;
  countryIso2: string;
  countryPopulation: number | null;
  stateId: string | null;
  stateName: string | null;
  stateCode: string | null;
  statePopulation: number | null;
  cityId: string | null;
  cityName: string | null;
  citySlug: string | null;
  cityPopulation: number | null;
}

/** A seeded city hit joined to its state + country. */
export interface CityPlaceRow {
  cityId: string;
  cityName: string;
  cityLat: number | null;
  cityLng: number | null;
  stateId: string;
  stateName: string;
  stateCode: string | null;
  countryId: number;
  countryName: string;
  countryIso2: string;
}

export interface NewStateRef {
  countryId: number;
  name: string;
  code: string | null;
}

export interface NewCityRef {
  stateId: string;
  name: string;
  slug: string;
  latitude: number | null;
  longitude: number | null;
}

/** Escape LIKE wildcards so a slug base is matched literally. */
function escapeLike(s: string): string {
  return s.replace(/[\\%_]/g, (m) => `\\${m}`);
}

export class LocationReferenceRepository {
  constructor(private readonly db: DbLike) {}

  /** iso2 → country id for every iso2 that exists. */
  async findCountryIdsByIso2(iso2s: readonly string[]): Promise<Map<string, number>> {
    const out = new Map<string, number>();
    if (iso2s.length === 0) return out;
    const rows = (await this.db
      .select({ id: countries.id, iso2: countries.iso2 })
      .from(countries)
      .where(inArray(countries.iso2, [...iso2s]))) as Array<{ id: number; iso2: string }>;
    for (const r of rows) out.set(r.iso2, r.id);
    return out;
  }

  /** Multi-row insert of placeholder countries (name = iso2); conflicts
   *  ignored. Returns iso2 → id for the rows actually inserted. */
  async insertCountries(iso2s: readonly string[]): Promise<Map<string, number>> {
    const out = new Map<string, number>();
    if (iso2s.length === 0) return out;
    const rows = (await this.db
      .insert(countries)
      .values(iso2s.map((iso2) => ({ name: iso2, iso2 })))
      .onConflictDoNothing()
      .returning({ id: countries.id, iso2: countries.iso2 })) as Array<{ id: number; iso2: string }>;
    for (const r of rows) out.set(r.iso2, r.id);
    return out;
  }

  /** States in `countryIds` whose code is in `codes` OR name is in `names`.
   *  Callers apply the exact (country, code|name) match in memory. */
  async findStates(
    countryIds: readonly number[],
    codes: readonly string[],
    names: readonly string[],
  ): Promise<StateRefRow[]> {
    if (countryIds.length === 0 || (codes.length === 0 && names.length === 0)) return [];
    const keyConds = [
      ...(codes.length ? [inArray(stateProvinces.code, [...codes])] : []),
      ...(names.length ? [inArray(stateProvinces.name, [...names])] : []),
    ];
    return (await this.db
      .select({
        id: stateProvinces.id,
        countryId: stateProvinces.countryId,
        name: stateProvinces.name,
        code: stateProvinces.code,
      })
      .from(stateProvinces)
      .where(and(inArray(stateProvinces.countryId, [...countryIds]), or(...keyConds)))) as StateRefRow[];
  }

  async insertStates(rows: readonly NewStateRef[]): Promise<StateRefRow[]> {
    if (rows.length === 0) return [];
    return (await this.db
      .insert(stateProvinces)
      .values([...rows])
      .returning({
        id: stateProvinces.id,
        countryId: stateProvinces.countryId,
        name: stateProvinces.name,
        code: stateProvinces.code,
      })) as StateRefRow[];
  }

  /** Cities in `stateIds` whose name is in `names` (exact pairs matched by caller). */
  async findCities(stateIds: readonly string[], names: readonly string[]): Promise<CityRefRow[]> {
    if (stateIds.length === 0 || names.length === 0) return [];
    return (await this.db
      .select({ id: cities.id, stateId: cities.stateId, name: cities.name })
      .from(cities)
      .where(and(inArray(cities.stateId, [...stateIds]), inArray(cities.name, [...names])))) as CityRefRow[];
  }

  /** Every taken slug in `stateIds` that starts with any of `bases` — one
   *  `LIKE base%` query replaces the per-candidate probe loop. */
  async findCitySlugsWithPrefixes(
    stateIds: readonly string[],
    bases: readonly string[],
  ): Promise<Array<{ stateId: string; slug: string }>> {
    if (stateIds.length === 0 || bases.length === 0) return [];
    return (await this.db
      .select({ stateId: cities.stateId, slug: cities.slug })
      .from(cities)
      .where(
        and(
          inArray(cities.stateId, [...stateIds]),
          or(...bases.map((b) => like(cities.slug, `${escapeLike(b)}%`))),
        ),
      )) as Array<{ stateId: string; slug: string }>;
  }

  async insertCities(rows: readonly NewCityRef[]): Promise<CityRefRow[]> {
    if (rows.length === 0) return [];
    return (await this.db
      .insert(cities)
      .values([...rows])
      .returning({ id: cities.id, stateId: cities.stateId, name: cities.name })) as CityRefRow[];
  }

  // ── picker / directory reads ──────────────────────────────────────────────

  async listActiveCountries(): Promise<CountryListRow[]> {
    return (await this.db
      .select({
        id: countries.id,
        name: countries.name,
        iso2: countries.iso2,
        iso3: countries.iso3,
        phoneCode: countries.phoneCode,
        currency: countries.currency,
      })
      .from(countries)
      .where(eq(countries.isActive, true))
      .orderBy(asc(countries.name))) as CountryListRow[];
  }

  async listActiveStatesForCountry(countryId: number): Promise<StateListRow[]> {
    return (await this.db
      .select({
        id: stateProvinces.id,
        name: stateProvinces.name,
        code: stateProvinces.code,
        countryId: stateProvinces.countryId,
      })
      .from(stateProvinces)
      .where(and(eq(stateProvinces.countryId, countryId), eq(stateProvinces.isActive, true)))
      .orderBy(asc(stateProvinces.name))) as StateListRow[];
  }

  /** Active cities in a state, optionally narrowed by a case-insensitive name prefix (max 100). */
  async listActiveCitiesForState(stateId: string, namePrefix?: string): Promise<CityListRow[]> {
    const whereClauses = [eq(cities.stateId, stateId), eq(cities.isActive, true)];
    if (namePrefix) whereClauses.push(ilike(cities.name, `${namePrefix}%`));
    return (await this.db
      .select({
        id: cities.id,
        name: cities.name,
        stateId: cities.stateId,
        latitude: cities.latitude,
        longitude: cities.longitude,
      })
      .from(cities)
      .where(and(...whereClauses))
      .orderBy(asc(cities.name))
      .limit(100)) as CityListRow[];
  }

  /** Flattened country → active state → active city rows for the given
   *  (uppercased) iso2 set, ordered country, state name, city population
   *  DESC NULLS LAST, city name — the order the sitemap tree builder relies on. */
  async listLocationTreeRows(iso2s: readonly string[]): Promise<LocationTreeRow[]> {
    return (await this.db
      .select({
        countryId: countries.id,
        countryName: countries.name,
        countryIso2: countries.iso2,
        countryPopulation: countries.population,
        stateId: stateProvinces.id,
        stateName: stateProvinces.name,
        stateCode: stateProvinces.code,
        statePopulation: stateProvinces.population,
        cityId: cities.id,
        cityName: cities.name,
        citySlug: cities.slug,
        cityPopulation: cities.population,
      })
      .from(countries)
      .leftJoin(stateProvinces, and(eq(stateProvinces.countryId, countries.id), eq(stateProvinces.isActive, true)))
      .leftJoin(cities, and(eq(cities.stateId, stateProvinces.id), eq(cities.isActive, true)))
      .where(and(eq(countries.isActive, true), inArray(sql`upper(${countries.iso2})`, [...iso2s])))
      .orderBy(asc(countries.name), asc(stateProvinces.name), sql`${cities.population} DESC NULLS LAST`, asc(cities.name))) as LocationTreeRow[];
  }

  /** Seeded cities whose name starts with `prefix` (case-insensitive), joined to state + country. */
  async searchCitiesByPrefix(prefix: string, limit = 6): Promise<CityPlaceRow[]> {
    return (await this.db
      .select({
        cityId: cities.id,
        cityName: cities.name,
        cityLat: cities.latitude,
        cityLng: cities.longitude,
        stateId: stateProvinces.id,
        stateName: stateProvinces.name,
        stateCode: stateProvinces.code,
        countryId: countries.id,
        countryName: countries.name,
        countryIso2: countries.iso2,
      })
      .from(cities)
      .innerJoin(stateProvinces, eq(stateProvinces.id, cities.stateId))
      .innerJoin(countries, eq(countries.id, stateProvinces.countryId))
      .where(ilike(cities.name, `${prefix}%`))
      .limit(limit)) as CityPlaceRow[];
  }
}
