/**
 * Mapbox Geocoding adapter.
 *
 * Two roles:
 *  1) Forward-geocode free text → structured place(s) with country / state /
 *     city / lat / lng. Used by the LocationService picker autocomplete
 *     and by the one-shot backfill of legacy free-text `location` columns.
 *  2) Reverse-geocode lat/lng → nearest city for radius queries that came
 *     from "use my location" instead of a picker selection.
 *
 * Token absence is a first-class state — the service falls back to the
 * seeded reference data (countries + states + ~80 cities) in
 * migration 0108. Dev environments without MAPBOX_TOKEN still get
 * autocomplete that works for the major metros; production sets the
 * token via `wrangler secret put MAPBOX_TOKEN`.
 *
 * No SDK dependency — Mapbox's REST endpoint is small and stable, and
 * adding the npm SDK on Cloudflare Workers bloats the bundle.
 */

export interface GeocoderPlace {
  /** Mapbox feature id, e.g. "place.7434323542", used for de-dupe. */
  externalId: string;
  /** Display string Mapbox returns ("Seattle, Washington, United States"). */
  label: string;
  /** ISO-3166 alpha-2, uppercase. */
  countryIso2: string | null;
  /** Region / state / province name as Mapbox returns it. */
  stateName: string | null;
  /** Region short-code where available ("WA", "CA-ON", …). May be truncated
   *  to the bit after the dash for storage in `state_provinces.code`. */
  stateCode: string | null;
  /** Locality name (city, town, suburb). */
  cityName: string | null;
  /** Postal / ZIP if returned. */
  postalCode: string | null;
  latitude: number;
  longitude: number;
  /** Mapbox place_type bucket — "place" / "region" / "country" / "postcode". */
  placeType: string;
}

export interface GeocoderPort {
  /** True iff a Mapbox token is configured. Callers branch on this to
   *  decide whether to surface Mapbox-only UX (live autocomplete) or fall
   *  back to seeded reference data. */
  isLive(): boolean;

  /** Forward geocode — free text → ordered list of matches. Empty list
   *  if disabled. `proximity` biases results toward a lat/lng (used to
   *  prefer the viewer's home city when their query is ambiguous). */
  forward(
    query: string,
    opts?: { limit?: number; countryIso2?: string; proximity?: { lat: number; lng: number } },
  ): Promise<GeocoderPlace[]>;

  /** Reverse geocode — lat/lng → nearest place. Returns null if disabled
   *  or no match. */
  reverse(lat: number, lng: number): Promise<GeocoderPlace | null>;
}

/** Production Mapbox-backed implementation. */
export function buildMapboxGeocoder(env: Record<string, string | undefined>): GeocoderPort {
  const token = env.MAPBOX_TOKEN || env.MAPBOX_ACCESS_TOKEN;

  return {
    isLive() {
      return Boolean(token);
    },

    async forward(query, opts = {}) {
      if (!token) return [];
      const trimmed = query.trim();
      if (!trimmed) return [];
      const limit = Math.min(10, Math.max(1, opts.limit ?? 5));

      const params = new URLSearchParams({
        access_token: token,
        autocomplete: "true",
        limit: String(limit),
        types: "country,region,postcode,district,place,locality,neighborhood",
      });
      if (opts.countryIso2) params.set("country", opts.countryIso2.toLowerCase());
      if (opts.proximity) {
        params.set("proximity", `${opts.proximity.lng},${opts.proximity.lat}`);
      }

      const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(trimmed)}.json?${params.toString()}`;
      let resp: Response;
      try {
        resp = await fetch(url);
      } catch {
        return [];
      }
      if (!resp.ok) return [];
      const data = (await resp.json().catch(() => null)) as { features?: MapboxFeature[] } | null;
      if (!data?.features) return [];
      return data.features.map(toGeocoderPlace);
    },

    async reverse(lat, lng) {
      if (!token) return null;
      const params = new URLSearchParams({
        access_token: token,
        limit: "1",
        types: "place,locality,district",
      });
      const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${lng},${lat}.json?${params.toString()}`;
      let resp: Response;
      try {
        resp = await fetch(url);
      } catch {
        return null;
      }
      if (!resp.ok) return null;
      const data = (await resp.json().catch(() => null)) as { features?: MapboxFeature[] } | null;
      const feat = data?.features?.[0];
      return feat ? toGeocoderPlace(feat) : null;
    },
  };
}

/** Stub used by tests + dev without a Mapbox token. */
export const stubGeocoder: GeocoderPort = {
  isLive: () => false,
  forward: async () => [],
  reverse: async () => null,
};

interface MapboxFeature {
  id: string;
  place_name: string;
  place_type: string[];
  center: [number, number];
  text?: string;
  properties?: { short_code?: string };
  context?: Array<{ id: string; text: string; short_code?: string }>;
}

function toGeocoderPlace(f: MapboxFeature): GeocoderPlace {
  const [lng, lat] = f.center;
  const ctx = f.context ?? [];
  const find = (prefix: string) => ctx.find((c) => c.id.startsWith(prefix));

  const country = find("country");
  const region = find("region");
  const postcode = find("postcode");
  const placeTypeRaw = f.place_type[0] ?? "place";

  // For non-place features the feature itself IS the country/region/etc.
  const cityName = placeTypeRaw === "place" || placeTypeRaw === "locality" ? f.text ?? null : null;
  const stateName = placeTypeRaw === "region" ? f.text ?? null : region?.text ?? null;
  const stateShort = (
    placeTypeRaw === "region" ? f.properties?.short_code : region?.short_code
  ) ?? null;
  const countryShort = (
    placeTypeRaw === "country" ? f.properties?.short_code : country?.short_code
  ) ?? null;

  return {
    externalId: f.id,
    label: f.place_name,
    countryIso2: countryShort ? countryShort.toUpperCase().slice(0, 2) : null,
    stateName,
    // Mapbox returns "US-WA" for US states — strip the country prefix.
    stateCode: stateShort ? stateShort.split("-").pop()!.toUpperCase() : null,
    cityName,
    postalCode: placeTypeRaw === "postcode" ? f.text ?? null : postcode?.text ?? null,
    latitude: lat,
    longitude: lng,
    placeType: placeTypeRaw,
  };
}
