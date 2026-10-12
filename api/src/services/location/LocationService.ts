/**
 * LocationService — the single seam every route uses to:
 *   • save geo tags for an entity (jobs, resumes, videos, services, articles…)
 *   • read resolved locations for display
 *   • turn a search-side filter (LocationFilter from shared/content-locations)
 *     into a set of matching entity ids for any kind
 *   • normalize free-text user input ("Seattle, WA") into structured ids
 *     via Mapbox + the seeded reference data
 *   • grow the reference-data tables on the fly when the geocoder returns
 *     a city / state we don't have yet
 *
 * Every search route imports `applyLocationFilter` from here so there is
 * one geo-filter implementation across the codebase — adding a new content
 * type means adding its kind to shared/content-locations.ts and calling
 * this helper, nothing more.
 *
 * DI: takes a `Pick<ApiDeps, "repos" | "geocoder">` slice. The repos
 * bundle exposes `contentLocations` (the polymorphic table) and the
 * underlying db handle is reached via repo methods only.
 */

import { eq, sql } from "drizzle-orm";
import { getDb, schema } from "../../db/index.js";
import type { ApiDeps } from "../apiDeps.js";
import type {
  ContentLocationInput,
  ContentLocationKind,
  ContentLocationSet,
  LocationFilter,
  ResolvedContentLocation,
} from "../../../../shared/content-locations.js";
import type { GeocoderPlace } from "../adapters/mapbox.js";
import type { SaveLocationInput } from "../../repositories/contentLocationsRepository.js";
import { LocationReferenceRepository } from "../../repositories/locationReferenceRepository.js";
import { ensureGeocodedPlaces, type ResolvedFreeText } from "./geocodedPlaceResolver.js";

const { countries, stateProvinces, cities } = schema;

export type LocationDeps = Pick<ApiDeps, "repos" | "geocoder">;

export class LocationService {
  constructor(private readonly deps: LocationDeps) {}

  /** Save the full location set for an entity, replacing what was there. */
  async setForEntity(
    entityKind: ContentLocationKind,
    entityId: string,
    set: ContentLocationSet,
  ): Promise<void> {
    const origin = set.origin ? this.toSaveInput(set.origin, "origin") : null;
    const serves = (set.serves ?? []).map((s) => this.toSaveInput(s, "serves"));
    await this.deps.repos.contentLocations.replaceForEntity(
      entityKind,
      entityId,
      origin,
      serves,
    );
  }

  /** Resolved locations for an entity — for detail-page rendering. */
  async getForEntity(
    entityKind: ContentLocationKind,
    entityId: string,
  ): Promise<ResolvedContentLocation[]> {
    return this.deps.repos.contentLocations.findResolvedForEntity(entityKind, entityId);
  }

  /** Bulk-resolve for search-results hydration (no N+1). */
  async getForEntities(
    entityKind: ContentLocationKind,
    entityIds: string[],
  ): Promise<Map<string, ResolvedContentLocation[]>> {
    return this.deps.repos.contentLocations.findResolvedForEntities(entityKind, entityIds);
  }

  /**
   * Translate a search-side LocationFilter into a Set<string> of matching
   * entity ids of the given kind. Returns null when the filter is empty
   * — callers treat that as "no geo intersection; pass the result set
   * through unchanged."
   *
   * When the filter carries free-text only (no ids), this geocodes via
   * Mapbox + ensures the resulting ids exist locally before filtering,
   * so the polymorphic table query stays cheap (no LIKE).
   */
  async applyLocationFilter(
    entityKind: ContentLocationKind,
    filter: LocationFilter | null | undefined,
  ): Promise<string[] | null> {
    if (!filter) return null;

    let { countryId, stateId, cityId, latitude, longitude, radiusKm, remote, text } = filter;

    if (!countryId && !stateId && !cityId && !latitude && !longitude && remote === undefined && text) {
      const resolved = await this.resolveFreeText(text);
      if (resolved) {
        countryId = resolved.countryId ?? countryId;
        stateId = resolved.stateId ?? stateId;
        cityId = resolved.cityId ?? cityId;
        latitude = resolved.latitude ?? latitude;
        longitude = resolved.longitude ?? longitude;
      }
    }

    return this.deps.repos.contentLocations.matchingEntityIds({
      entityKind,
      countryId: countryId ?? null,
      stateId: stateId ?? null,
      cityId: cityId ?? null,
      latitude: latitude ?? null,
      longitude: longitude ?? null,
      radiusKm: radiusKm ?? null,
      remote,
    });
  }

  /**
   * Normalize a free-text place ("Seattle, WA", "London, UK", "94110")
   * into resolved structured ids — geocoding via Mapbox when configured
   * and falling back to seeded reference-data lookups otherwise.
   *
   * Side-effect: when Mapbox returns a city/state not already in the
   * reference tables, this inserts it so future filters can hit the
   * index instead of re-geocoding.
   */
  async resolveFreeText(text: string): Promise<ResolvedFreeText | null> {
    const trimmed = text.trim();
    if (!trimmed) return null;

    if (this.deps.geocoder.isLive()) {
      const places = await this.deps.geocoder.forward(trimmed, { limit: 1 });
      const best = places[0];
      if (best) return this.ensureGeocodedPlace(best);
    }

    // Token absent → best-effort lookup against seeded reference data.
    return this.lookupSeededByText(trimmed);
  }

  /** Ensures a geocoded place exists in the local reference tables and
   *  returns its resolved ids. Delegates to the batch path. */
  async ensureGeocodedPlace(place: GeocoderPlace): Promise<ResolvedFreeText> {
    const [resolved] = await this.ensureGeocodedPlaces([place]);
    return resolved!;
  }

  /** Batch form — a fixed number of round-trips for any number of places
   *  (see geocodedPlaceResolver.ts). Output preserves input order. */
  async ensureGeocodedPlaces(places: readonly GeocoderPlace[]): Promise<ResolvedFreeText[]> {
    return ensureGeocodedPlaces(new LocationReferenceRepository(getDb()), places);
  }

  /** Token-absent path — case-insensitive lookups in countries/states/cities. */
  private async lookupSeededByText(text: string): Promise<ResolvedFreeText | null> {
    const db = getDb();
    const lc = text.toLowerCase();

    // Try city first, then state, then country.
    const cityRows = (await db
      .select({
        cityId: cities.id,
        cityName: cities.name,
        cityLat: cities.latitude,
        cityLng: cities.longitude,
        stateId: stateProvinces.id,
        countryId: countries.id,
      })
      .from(cities)
      .innerJoin(stateProvinces, eq(stateProvinces.id, cities.stateId))
      .innerJoin(countries, eq(countries.id, stateProvinces.countryId))
      .where(sql`lower(${cities.name}) = ${lc}`)
      .limit(1)) as Array<{
      cityId: string;
      cityName: string;
      cityLat: number | null;
      cityLng: number | null;
      stateId: string;
      countryId: number;
    }>;
    if (cityRows[0]) {
      const r = cityRows[0];
      return {
        countryId: r.countryId,
        stateId: r.stateId,
        cityId: r.cityId,
        latitude: r.cityLat,
        longitude: r.cityLng,
        label: r.cityName,
        postalCode: null,
      };
    }

    const stateRows = (await db
      .select({
        stateId: stateProvinces.id,
        stateName: stateProvinces.name,
        countryId: countries.id,
      })
      .from(stateProvinces)
      .innerJoin(countries, eq(countries.id, stateProvinces.countryId))
      .where(
        sql`lower(${stateProvinces.name}) = ${lc} OR lower(${stateProvinces.code}) = ${lc}`,
      )
      .limit(1)) as Array<{ stateId: string; stateName: string; countryId: number }>;
    if (stateRows[0]) {
      const r = stateRows[0];
      return {
        countryId: r.countryId,
        stateId: r.stateId,
        cityId: null,
        latitude: null,
        longitude: null,
        label: r.stateName,
        postalCode: null,
      };
    }

    const countryRows = (await db
      .select({ id: countries.id, name: countries.name })
      .from(countries)
      .where(
        sql`lower(${countries.name}) = ${lc} OR lower(${countries.iso2}) = ${lc} OR lower(${countries.iso3}) = ${lc}`,
      )
      .limit(1)) as Array<{ id: number; name: string }>;
    if (countryRows[0]) {
      return {
        countryId: countryRows[0].id,
        stateId: null,
        cityId: null,
        latitude: null,
        longitude: null,
        label: countryRows[0].name,
        postalCode: null,
      };
    }

    return null;
  }

  private toSaveInput(input: Partial<ContentLocationInput>, role: "origin" | "serves"): SaveLocationInput {
    return {
      role,
      countryId: input.countryId ?? null,
      stateId: input.stateId ?? null,
      cityId: input.cityId ?? null,
      postalCode: input.postalCode ?? null,
      latitude: input.latitude ?? null,
      longitude: input.longitude ?? null,
      radiusKm: input.radiusKm ?? null,
      label: input.label ?? null,
      isRemote: input.isRemote ?? false,
    };
  }
}

export type { ResolvedFreeText };
