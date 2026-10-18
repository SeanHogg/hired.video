/**
 * /api/locations — reference-data endpoints powering every LocationPicker
 * + LocationFilter UI surface.
 *
 *   GET /api/locations/countries                 → all active countries
 *   GET /api/locations/states?countryId=         → states for a country
 *   GET /api/locations/cities?stateId=&q=        → cities for a state, optionally narrowed by prefix
 *   GET /api/locations/search?q=                 → Mapbox forward-geocode (with seed fallback)
 *   GET /api/locations/reverse?lat=&lng=         → "use my location" reverse geocode
 *
 * The picker hits /countries on mount, then /states + /cities as the
 * user drills down. The "search" endpoint backs the autocomplete free-
 * text field — it returns a normalized place + the resolved structured
 * ids the frontend stores in the form state. When MAPBOX_TOKEN is
 * unset the search endpoint falls back to a case-insensitive prefix
 * lookup over the seeded cities/states/countries.
 */
import { Hono } from "hono";
import type { AppEnv } from "../types/index.js";
import { success, error } from "../types/index.js";
import { buildApiDeps } from "../services/apiDeps.js";
import { LocationService } from "../services/location/LocationService.js";
import {
  assertContentLocationOwnership,
  getLocationSitemap,
  listCities,
  listCountries,
  listStates,
  resolveLocationSlugs,
  searchSeededPlaces,
} from "../services/location/locationDirectory.js";
import {
  CONTENT_LOCATION_KINDS,
  ContentLocationSetSchema,
  type ContentLocationKind,
} from "../../../shared/content-locations.js";
import { requireUser } from "./helpers/routerHelpers.js";
import { validateJson } from "./helpers/validate.js";

export const locationRoutes = new Hono<AppEnv>();

locationRoutes.get("/countries", async (c) => {
  return c.json(success(await listCountries()), 200);
});

locationRoutes.get("/states", async (c) => {
  const rows = await listStates({ countryId: c.req.query("countryId"), countryIso2: c.req.query("countryIso2") });
  return c.json(success(rows), 200);
});

/**
 * GET /api/locations/sitemap
 *
 * Country → state → top-cities tree powering `/sitemap/locations` and the
 * expanded-footer Locations column: launch markets only
 * (shared/launch-markets.ts), states de-duped by lowercased name, cities
 * ranked by population (NULLs last) capped at 25 per state, empty countries
 * dropped. See services/location/locationDirectory.ts.
 */
locationRoutes.get("/sitemap", async (c) => {
  return c.json(success(await getLocationSitemap()), 200);
});

/**
 * GET /api/locations/resolve?country=us&state=tx&city=austin
 *
 * Slug-based resolver for the /in/[country]/[state?]/[city?] landing
 * page routes (#1628). Each segment is optional — a country-only call
 * returns {country, state: null, city: null}, and so on. Slugs match:
 *   - country: lowercased iso2 ("us") OR iso3 ("usa") OR slugified name
 *   - state:   lowercased code ("tx") OR slugified name
 *   - city:    cities.slug (UNIQUE per state, backfilled by migration 0166)
 *
 * Returns 404 when any non-null segment fails to resolve (or the country is
 * not a launch market); a city without a state is a 400.
 */
locationRoutes.get("/resolve", async (c) => {
  const countrySlug = (c.req.query("country") ?? "").trim().toLowerCase();
  if (!countrySlug) return c.json(error("VALIDATION_ERROR", "country is required"), 400);
  const geo = await resolveLocationSlugs({
    country: countrySlug,
    state: c.req.query("state"),
    city: c.req.query("city"),
  });
  return c.json(success({ country: geo.country, state: geo.state, city: geo.city }), 200);
});

locationRoutes.get("/cities", async (c) => {
  const stateId = c.req.query("stateId");
  const q = (c.req.query("q") ?? "").trim();
  if (!stateId) return c.json(success([]), 200);
  return c.json(success(await listCities(stateId, q)), 200);
});

// Autocomplete — Mapbox passthrough with seed-table fallback. Returns
// normalized hits with structured ids the form state can store directly.
locationRoutes.get("/search", async (c) => {
  const q = (c.req.query("q") ?? "").trim();
  const countryIso2 = c.req.query("country")?.toUpperCase();
  if (!q) return c.json(success([]), 200);

  const env = (c.env ?? {}) as Record<string, string | undefined>;
  const deps = buildApiDeps(env);
  const service = new LocationService(deps);

  // Live geocoder path — Mapbox returns the richest results and we
  // ensure each one exists in the local reference tables so future
  // saves can store the resolved ids.
  if (deps.geocoder.isLive()) {
    const places = await deps.geocoder.forward(q, { limit: 6, countryIso2 });
    // One batched ensure for every hit (fixed round-trips, not per place).
    const ensured = await service.ensureGeocodedPlaces(places);
    const resolved = places.map((p, i) => {
      const r = ensured[i]!;
      return {
        label: p.label,
        placeType: p.placeType,
        countryId: r.countryId,
        stateId: r.stateId,
        cityId: r.cityId,
        postalCode: r.postalCode,
        latitude: r.latitude,
        longitude: r.longitude,
      };
    });
    return c.json(success(resolved), 200);
  }

  // Fallback — prefix-match seeded cities.
  return c.json(success(await searchSeededPlaces(q)), 200);
});

locationRoutes.get("/reverse", async (c) => {
  const lat = Number(c.req.query("lat"));
  const lng = Number(c.req.query("lng"));
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return c.json(error("VALIDATION_ERROR", "lat and lng required"), 400);
  }
  const env = (c.env ?? {}) as Record<string, string | undefined>;
  const deps = buildApiDeps(env);
  const service = new LocationService(deps);
  const place = await deps.geocoder.reverse(lat, lng);
  if (!place) return c.json(success(null), 200);
  const resolved = await service.ensureGeocodedPlace(place);
  return c.json(
    success({
      label: place.label,
      placeType: place.placeType,
      countryId: resolved.countryId,
      stateId: resolved.stateId,
      cityId: resolved.cityId,
      postalCode: resolved.postalCode,
      latitude: resolved.latitude,
      longitude: resolved.longitude,
    }),
    200,
  );
});

// ─── Set / replace locations for an entity ──────────────────────────────
// One generic endpoint that every content type calls after its own save
// succeeds. The caller must own the entity — per-kind owner rules live in
// assertContentLocationOwnership (services/location/locationDirectory.ts).
locationRoutes.post("/entities/:kind/:id", validateJson(ContentLocationSetSchema, (e) => error("VALIDATION_ERROR", "Invalid location payload", { issues: e.flatten() })), async (c) => {
  const userId = requireUser(c);
  const kindParam = c.req.param("kind") as ContentLocationKind;
  if (!CONTENT_LOCATION_KINDS.includes(kindParam)) {
    return c.json(error("VALIDATION_ERROR", `Unknown entity kind: ${kindParam}`), 400);
  }
  const entityId = c.req.param("id");
  const body = c.req.valid("json");

  await assertContentLocationOwnership(kindParam, entityId, userId);

  const env = (c.env ?? {}) as Record<string, string | undefined>;
  const deps = buildApiDeps(env);
  const svc = new LocationService(deps);
  await svc.setForEntity(kindParam, entityId, body);
  const resolved = await svc.getForEntity(kindParam, entityId);
  return c.json(success(resolved), 200);
});

locationRoutes.get("/entities/:kind/:id", async (c) => {
  const kindParam = c.req.param("kind") as ContentLocationKind;
  if (!CONTENT_LOCATION_KINDS.includes(kindParam)) {
    return c.json(error("VALIDATION_ERROR", `Unknown entity kind: ${kindParam}`), 400);
  }
  const entityId = c.req.param("id");
  const env = (c.env ?? {}) as Record<string, string | undefined>;
  const deps = buildApiDeps(env);
  const svc = new LocationService(deps);
  const resolved = await svc.getForEntity(kindParam, entityId);
  return c.json(success(resolved), 200);
});
