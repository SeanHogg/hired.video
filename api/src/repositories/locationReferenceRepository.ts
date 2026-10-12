/**
 * LocationReferenceRepository — batch reads/writes for the geo reference
 * tables (countries / state_provinces / cities) used when the geocoder
 * returns places we may not have yet.
 *
 * Every method is set-shaped (inArray / multi-row insert) so resolving a
 * page of autocomplete hits costs a fixed number of round-trips instead
 * of several per place.
 */
import { and, eq, inArray, like, or } from "drizzle-orm";
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
}
