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

import { and, eq, sql } from "drizzle-orm";
import { getDb, schema } from "../../db/index.js";
import type { ApiDeps } from "../apiDeps.js";
import { slugify } from "../../../../shared/slugify.js";
import type {
  ContentLocationInput,
  ContentLocationKind,
  ContentLocationSet,
  LocationFilter,
  ResolvedContentLocation,
} from "../../../../shared/content-locations.js";
import type { GeocoderPlace } from "../adapters/mapbox.js";
import type { SaveLocationInput } from "../../repositories/contentLocationsRepository.js";

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
   *  returns its resolved ids. Cheap — uses ON CONFLICT to be idempotent. */
  async ensureGeocodedPlace(place: GeocoderPlace): Promise<ResolvedFreeText> {
    const db = getDb();
    let countryId: number | null = null;
    let stateId: string | null = null;
    let cityId: string | null = null;

    if (place.countryIso2) {
      const [c] = await db
        .select({ id: countries.id })
        .from(countries)
        .where(eq(countries.iso2, place.countryIso2))
        .limit(1);
      countryId = (c as { id: number } | undefined)?.id ?? null;
      if (!countryId) {
        const [inserted] = (await db
          .insert(countries)
          .values({
            name: place.countryIso2,
            iso2: place.countryIso2,
          } as any)
          .onConflictDoNothing()
          .returning({ id: countries.id })) as Array<{ id: number }>;
        countryId =
          inserted?.id ??
          (
            (await db
              .select({ id: countries.id })
              .from(countries)
              .where(eq(countries.iso2, place.countryIso2))
              .limit(1)) as Array<{ id: number }>
          )[0]?.id ??
          null;
      }
    }

    if (countryId != null && (place.stateName || place.stateCode)) {
      const matchKey = place.stateCode ?? place.stateName!;
      const [existing] = await db
        .select({ id: stateProvinces.id })
        .from(stateProvinces)
        .where(
          and(
            eq(stateProvinces.countryId, countryId),
            place.stateCode
              ? eq(stateProvinces.code, place.stateCode)
              : eq(stateProvinces.name, place.stateName!),
          ),
        )
        .limit(1);
      stateId = (existing as { id: string } | undefined)?.id ?? null;
      if (!stateId) {
        const [inserted] = (await db
          .insert(stateProvinces)
          .values({
            countryId,
            name: place.stateName ?? matchKey,
            code: place.stateCode ?? null,
          } as any)
          .returning({ id: stateProvinces.id })) as Array<{ id: string }>;
        stateId = inserted?.id ?? null;
      }
    }

    if (stateId && place.cityName) {
      const [existing] = await db
        .select({ id: cities.id })
        .from(cities)
        .where(
          and(eq(cities.stateId, stateId), eq(cities.name, place.cityName)),
        )
        .limit(1);
      cityId = (existing as { id: string } | undefined)?.id ?? null;
      if (!cityId) {
        // cities.slug is NOT NULL after migration 0149. Generate via the
        // canonical slugify() so the runtime ensure-on-write path matches
        // the migration's SQL backfill regex. Collisions within a state
        // (two cities with the same slugified name — rare for Mapbox
        // results) are disambiguated by appending `-2`, `-3`, … against
        // the existing rows in this state.
        const baseSlug = slugify(place.cityName, { fallback: "city", maxLen: 64 });
        const slug = await this.findFreeCitySlug(db, stateId, baseSlug);
        const [inserted] = (await db
          .insert(cities)
          .values({
            stateId,
            name: place.cityName,
            slug,
            latitude: place.latitude,
            longitude: place.longitude,
          } as any)
          .returning({ id: cities.id })) as Array<{ id: string }>;
        cityId = inserted?.id ?? null;
      }
    }

    return {
      countryId,
      stateId,
      cityId,
      latitude: place.latitude,
      longitude: place.longitude,
      label: place.label,
      postalCode: place.postalCode ?? null,
    };
  }

  /** Probe for the first free `(state_id, slug)` pair starting from
   *  `base` and appending `-2`, `-3`, … as needed. Idempotent — if a row
   *  already owns `base` for a different name, the next caller for the
   *  same name will hit it and re-use the existing city via the name
   *  check that ran above this. */
  private async findFreeCitySlug(db: any, stateId: string, base: string): Promise<string> {
    let candidate = base;
    let suffix = 2;
    // Hard cap at ~50 iterations so a pathological name doesn't spin.
    for (let i = 0; i < 50; i++) {
      const [taken] = await db
        .select({ id: cities.id })
        .from(cities)
        .where(and(eq(cities.stateId, stateId), eq(cities.slug, candidate)))
        .limit(1);
      if (!taken) return candidate;
      candidate = `${base}-${suffix++}`;
    }
    // Pathological fallback — extremely unlikely; suffix with a random
    // 4-char hex so the insert still succeeds.
    return `${base}-${Math.random().toString(16).slice(2, 6)}`;
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

export interface ResolvedFreeText {
  countryId: number | null;
  stateId: string | null;
  cityId: string | null;
  latitude: number | null;
  longitude: number | null;
  label: string | null;
  postalCode: string | null;
}
