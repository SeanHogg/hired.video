/**
 * geocodedPlaceResolver — batch "make sure these geocoded places exist in
 * the local reference tables and return their ids".
 *
 * Replaces the per-place sequence (select country → maybe insert → select
 * state → maybe insert → select city → slug probe loop of up to 50
 * selects → insert) with set-shaped steps: one read per level, one
 * multi-row insert for whatever is missing, and a single `LIKE base%`
 * slug read whose free suffix is chosen in memory.
 *
 * Semantics mirror the original single-place path exactly:
 *   • country matched by iso2; missing → placeholder row (name = iso2),
 *     conflict-tolerant, re-read on conflict.
 *   • state matched within the country by code when the geocoder gave
 *     one, otherwise by name; missing → inserted.
 *   • city matched by (state, exact name); missing → inserted with the
 *     first free `slug`, `slug-2`, `slug-3`, … in that state.
 */
import { slugify } from "../../../../shared/slugify.js";
import type { GeocoderPlace } from "../adapters/mapbox.js";
import type {
  LocationReferenceRepository,
  NewCityRef,
  NewStateRef,
} from "../../repositories/locationReferenceRepository.js";

export interface ResolvedFreeText {
  countryId: number | null;
  stateId: string | null;
  cityId: string | null;
  latitude: number | null;
  longitude: number | null;
  label: string | null;
  postalCode: string | null;
}

type RefRepo = Pick<
  LocationReferenceRepository,
  | "findCountryIdsByIso2"
  | "insertCountries"
  | "findStates"
  | "insertStates"
  | "findCities"
  | "findCitySlugsWithPrefixes"
  | "insertCities"
>;

/** Max suffix probed before falling back to a random tail (matches the
 *  old loop's ~50-iteration cap). */
const MAX_SLUG_SUFFIX_PROBES = 50;

/** Pure: first of `base`, `base-2`, `base-3`, … not in `taken`. */
export function pickFreeSlug(base: string, taken: ReadonlySet<string>): string {
  let candidate = base;
  let suffix = 2;
  for (let i = 0; i < MAX_SLUG_SUFFIX_PROBES; i++) {
    if (!taken.has(candidate)) return candidate;
    candidate = `${base}-${suffix++}`;
  }
  // Pathological fallback — extremely unlikely; suffix with a random
  // 4-char hex so the insert still succeeds.
  return `${base}-${Math.random().toString(16).slice(2, 6)}`;
}

const stateKeyFor = (countryId: number, code: string | null, name: string | null): string =>
  code ? `${countryId}|c:${code}` : `${countryId}|n:${name ?? ""}`;
const cityKeyFor = (stateId: string, name: string): string => `${stateId}|${name}`;
function uniq<T>(xs: Iterable<T>): T[] {
  return Array.from(new Set(xs));
}

export async function ensureGeocodedPlaces(
  repo: RefRepo,
  places: readonly GeocoderPlace[],
): Promise<ResolvedFreeText[]> {
  if (places.length === 0) return [];

  // ── Countries ────────────────────────────────────────────────────────
  const iso2s = uniq(places.map((p) => p.countryIso2).filter((v): v is string => Boolean(v)));
  const countryByIso2 = await repo.findCountryIdsByIso2(iso2s);
  const missingIso2 = iso2s.filter((iso) => !countryByIso2.has(iso));
  if (missingIso2.length > 0) {
    for (const [iso, id] of await repo.insertCountries(missingIso2)) countryByIso2.set(iso, id);
    const stillMissing = missingIso2.filter((iso) => !countryByIso2.has(iso));
    if (stillMissing.length > 0) {
      for (const [iso, id] of await repo.findCountryIdsByIso2(stillMissing)) countryByIso2.set(iso, id);
    }
  }
  const countryIdOf = (p: GeocoderPlace): number | null =>
    p.countryIso2 ? countryByIso2.get(p.countryIso2) ?? null : null;

  // ── States ───────────────────────────────────────────────────────────
  const stateWants = new Map<string, NewStateRef>();
  const stateKeyOf = (p: GeocoderPlace): string | null => {
    const countryId = countryIdOf(p);
    if (countryId == null || !(p.stateName || p.stateCode)) return null;
    return stateKeyFor(countryId, p.stateCode, p.stateName);
  };
  for (const p of places) {
    const key = stateKeyOf(p);
    if (!key || stateWants.has(key)) continue;
    const matchKey = p.stateCode ?? p.stateName!;
    stateWants.set(key, {
      countryId: countryIdOf(p)!,
      name: p.stateName ?? matchKey,
      code: p.stateCode ?? null,
    });
  }
  const stateIdByKey = new Map<string, string>();
  if (stateWants.size > 0) {
    const wants = Array.from(stateWants.values());
    const existing = await repo.findStates(
      uniq(wants.map((w) => w.countryId)),
      uniq(wants.map((w) => w.code).filter((c): c is string => Boolean(c))),
      uniq(wants.filter((w) => !w.code).map((w) => w.name)),
    );
    const indexState = (row: { id: string; countryId: number; name: string; code: string | null }) => {
      const keys = [stateKeyFor(row.countryId, null, row.name)];
      if (row.code) keys.push(stateKeyFor(row.countryId, row.code, null));
      for (const key of keys) {
        if (stateWants.has(key) && !stateIdByKey.has(key)) stateIdByKey.set(key, row.id);
      }
    };
    existing.forEach(indexState);
    const toInsert = Array.from(stateWants.entries())
      .filter(([key]) => !stateIdByKey.has(key))
      .map(([, row]) => row);
    (await repo.insertStates(toInsert)).forEach(indexState);
  }

  // ── Cities ───────────────────────────────────────────────────────────
  const stateIdOf = (p: GeocoderPlace): string | null => {
    const key = stateKeyOf(p);
    return key ? stateIdByKey.get(key) ?? null : null;
  };
  const cityWants = new Map<string, { stateId: string; place: GeocoderPlace }>();
  for (const p of places) {
    const stateId = stateIdOf(p);
    if (!stateId || !p.cityName) continue;
    const key = cityKeyFor(stateId, p.cityName);
    if (!cityWants.has(key)) cityWants.set(key, { stateId, place: p });
  }
  const cityIdByKey = new Map<string, string>();
  if (cityWants.size > 0) {
    const wants = Array.from(cityWants.values());
    const existing = await repo.findCities(
      uniq(wants.map((w) => w.stateId)),
      uniq(wants.map((w) => w.place.cityName!)),
    );
    for (const row of existing) {
      const key = cityKeyFor(row.stateId, row.name);
      if (cityWants.has(key) && !cityIdByKey.has(key)) cityIdByKey.set(key, row.id);
    }

    const missing = Array.from(cityWants.entries()).filter(([key]) => !cityIdByKey.has(key));
    if (missing.length > 0) {
      // cities.slug is NOT NULL after migration 0166 and UNIQUE per
      // (state_id, slug). Generate via the canonical slugify() so this
      // path matches the migration's SQL backfill regex, then pick the
      // first free suffix against ONE prefix read of taken slugs.
      const withBase = missing.map(([key, w]) => ({
        key,
        ...w,
        base: slugify(w.place.cityName!, { fallback: "city", maxLen: 64 }),
      }));
      const taken = await repo.findCitySlugsWithPrefixes(
        uniq(withBase.map((w) => w.stateId)),
        uniq(withBase.map((w) => w.base)),
      );
      const takenByState = new Map<string, Set<string>>();
      for (const t of taken) {
        const set = takenByState.get(t.stateId) ?? new Set<string>();
        set.add(t.slug);
        takenByState.set(t.stateId, set);
      }
      const inserts: NewCityRef[] = withBase.map((w) => {
        const set = takenByState.get(w.stateId) ?? new Set<string>();
        takenByState.set(w.stateId, set);
        const slug = pickFreeSlug(w.base, set);
        set.add(slug); // reserve so a sibling in this batch can't reuse it
        return {
          stateId: w.stateId,
          name: w.place.cityName!,
          slug,
          latitude: w.place.latitude,
          longitude: w.place.longitude,
        };
      });
      for (const row of await repo.insertCities(inserts)) {
        cityIdByKey.set(cityKeyFor(row.stateId, row.name), row.id);
      }
    }
  }

  return places.map((p) => {
    const stateId = stateIdOf(p);
    return {
      countryId: countryIdOf(p),
      stateId,
      cityId: stateId && p.cityName ? cityIdByKey.get(cityKeyFor(stateId, p.cityName)) ?? null : null,
      latitude: p.latitude,
      longitude: p.longitude,
      label: p.label,
      postalCode: p.postalCode ?? null,
    };
  });
}
