/**
 * Location directory use cases behind `/api/locations` — the reference-data
 * reads powering every LocationPicker / LocationFilter, the launch-market
 * sitemap tree, the `/in/...` slug resolver, the seeded-city autocomplete
 * fallback, and the owner gate for tagging an entity with locations.
 *
 * Queries live in LocationReferenceRepository / ContentLocationOwnersRepository;
 * this module only shapes results and maps misses onto DomainErrors.
 */
import { getDb } from "../../db/index.js";
import { DomainError } from "../../domains/errors.js";
import {
  LocationReferenceRepository,
  type CityListRow,
  type CountryListRow,
  type LocationTreeRow,
  type StateListRow,
} from "../../repositories/locationReferenceRepository.js";
import { ContentLocationOwnersRepository } from "../../repositories/contentLocationOwnersRepository.js";
import { PROMOTABLE_MARKET_ISO2, isPromotableMarket } from "../../../../shared/launch-markets.js";
import type { ContentLocationKind } from "../../../../shared/content-locations.js";
import { resolveGeoSlugs, type ResolvedGeo } from "./resolve-geo-slugs.js";

const refs = () => new LocationReferenceRepository(getDb());

export function listCountries(): Promise<CountryListRow[]> {
  return refs().listActiveCountries();
}

/** States for a country given by numeric id or iso2; [] when neither resolves. */
export async function listStates(input: { countryId?: string; countryIso2?: string }): Promise<StateListRow[]> {
  const repo = refs();
  let countryId: number | null = null;
  if (input.countryId && /^\d+$/.test(input.countryId)) {
    countryId = Number(input.countryId);
  } else if (input.countryIso2) {
    const iso2 = input.countryIso2.toUpperCase();
    countryId = (await repo.findCountryIdsByIso2([iso2])).get(iso2) ?? null;
  }
  if (countryId == null) return [];
  return repo.listActiveStatesForCountry(countryId);
}

export function listCities(stateId: string, q: string): Promise<CityListRow[]> {
  return refs().listActiveCitiesForState(stateId, q.length > 0 ? q : undefined);
}

type CityEntry = { id: string; name: string; slug: string; population: number | null };
type StateEntry = { id: string; name: string; code: string | null; population: number | null; cities: CityEntry[] };
type CountryEntry = { id: number; name: string; iso2: string; population: number | null; states: StateEntry[] };

const CITY_CAP_PER_STATE = 25;

/** Folds the ordered tree rows: states collapse by lowercased name (legacy
 *  duplicate rows), cities de-dupe by slug and cap at 25 per state, and
 *  countries with no states are dropped. */
export function buildLocationTree(rows: readonly LocationTreeRow[]): CountryEntry[] {
  const out: CountryEntry[] = [];
  let currentCountry: CountryEntry | null = null;
  let currentState: StateEntry | null = null;
  let currentStateNameKey = "";
  let citySlugsInState = new Set<string>();

  for (const r of rows) {
    if (!currentCountry || currentCountry.id !== r.countryId) {
      currentCountry = { id: r.countryId, name: r.countryName, iso2: r.countryIso2, population: r.countryPopulation, states: [] };
      out.push(currentCountry);
      currentState = null;
      currentStateNameKey = "";
    }
    if (!r.stateId) continue;
    // Group by lowercased name (NOT id) so duplicate state rows collapse;
    // rows are ordered by state name so dupes are consecutive and the first
    // id wins as the canonical link target.
    const nameKey = r.stateName!.toLowerCase();
    if (!currentState || currentStateNameKey !== nameKey) {
      currentState = { id: r.stateId, name: r.stateName!, code: r.stateCode ?? null, population: r.statePopulation, cities: [] };
      currentCountry.states.push(currentState);
      currentStateNameKey = nameKey;
      citySlugsInState = new Set<string>();
    }
    if (r.cityId && currentState.cities.length < CITY_CAP_PER_STATE && !citySlugsInState.has(r.citySlug!)) {
      citySlugsInState.add(r.citySlug!);
      currentState.cities.push({ id: r.cityId, name: r.cityName!, slug: r.citySlug!, population: r.cityPopulation });
    }
  }
  return out.filter((co) => co.states.length > 0);
}

/** Launch-market country → state → top-cities tree (sitemap + footer). */
export async function getLocationSitemap(): Promise<CountryEntry[]> {
  return buildLocationTree(await refs().listLocationTreeRows(PROMOTABLE_MARKET_ISO2));
}

/** `/in/[country]/[state?]/[city?]` resolver. 400 for a city without a
 *  state, 404 for any other miss or a non-launched market. */
export async function resolveLocationSlugs(input: {
  country: string;
  state?: string | null;
  city?: string | null;
}): Promise<ResolvedGeo> {
  const resolved = await resolveGeoSlugs(getDb(), input);
  if (resolved.geo) {
    // Launch-market gate: a real-but-unlaunched country 404s rather than
    // rendering a thin page (shared/launch-markets.ts).
    if (!isPromotableMarket(resolved.geo.country.iso2)) {
      throw new DomainError(404, "NOT_FOUND", "country not available");
    }
    return resolved.geo;
  }
  if (resolved.failed === "city" && resolved.reason === "city requires state") {
    throw new DomainError(400, "VALIDATION_ERROR", resolved.reason ?? "city requires state");
  }
  throw new DomainError(404, "NOT_FOUND", resolved.reason ?? "not found");
}

/** Token-absent autocomplete: prefix-match seeded cities. */
export async function searchSeededPlaces(q: string) {
  const rows = await refs().searchCitiesByPrefix(q.toLowerCase(), 6);
  return rows.map((r) => ({
    label: [r.cityName, r.stateCode ?? r.stateName, r.countryIso2].filter(Boolean).join(", "),
    placeType: "place",
    countryId: r.countryId,
    stateId: r.stateId,
    cityId: r.cityId,
    postalCode: null as string | null,
    latitude: r.cityLat,
    longitude: r.cityLng,
  }));
}

/** The caller must own the entity it tags. user_profile's entity id is the
 *  user id itself; every other kind reads its owner column. Throws 404 for a
 *  missing row, 403 otherwise. */
export async function assertContentLocationOwnership(
  kind: ContentLocationKind,
  entityId: string,
  userId: string,
): Promise<void> {
  if (kind === "user_profile") {
    if (entityId !== userId) throw new DomainError(403, "FORBIDDEN", "Not your entity");
    return;
  }
  const lookup = await new ContentLocationOwnersRepository(getDb()).findOwner(kind, entityId);
  if (lookup && !lookup.found) throw new DomainError(404, "NOT_FOUND", "Entity not found");
  if (!lookup || !lookup.ownerId || lookup.ownerId !== userId) {
    throw new DomainError(403, "FORBIDDEN", "Not your entity");
  }
}
