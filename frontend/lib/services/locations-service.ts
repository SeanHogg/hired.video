/**
 * locations-service — frontend API client for the generic geo system.
 *
 * Backs <LocationPicker /> and <LocationFilter /> on every search page +
 * create/edit form. Mirrors the shape of the /api/locations routes
 * (see api/src/routes/locations.ts) and re-exports the shared types
 * so consumers only import from one place.
 */

import { apiClient } from "@/lib/api-client";
import type {
  ContentLocationKind,
  ContentLocationSet,
  ResolvedContentLocation,
} from "@shared/content-locations";

export type {
  ContentLocationKind,
  ContentLocationRole,
  ContentLocationInput,
  ContentLocationSet,
  LocationFilter,
  ResolvedContentLocation,
} from "@shared/content-locations";
export { formatLocation, radiusBoundingBox, haversineKm } from "@shared/content-locations";

export interface CountryOption {
  id: number;
  name: string;
  iso2: string;
  iso3: string | null;
  phoneCode: string | null;
  currency: string | null;
}

export interface StateOption {
  id: string;
  name: string;
  code: string | null;
  countryId: number;
}

export interface CityOption {
  id: string;
  name: string;
  stateId: string;
  latitude: string | null;
  longitude: string | null;
}

/**
 * Geocoder autocomplete hit. `cityId`/`stateId`/`countryId` are populated
 * once the backend has ensured the place exists in the reference tables —
 * the picker can store the ids straight into form state without a second
 * round-trip.
 */
export interface GeocodeHit {
  label: string;
  placeType: string;
  countryId: number | null;
  stateId: string | null;
  cityId: string | null;
  postalCode: string | null;
  latitude: number | null;
  longitude: number | null;
}

export const locationsService = {
  async countries(): Promise<CountryOption[]> {
    const res = await apiClient.get<CountryOption[]>("/api/locations/countries");
    return res.data ?? [];
  },

  async states(countryId: number): Promise<StateOption[]> {
    const res = await apiClient.get<StateOption[]>(`/api/locations/states?countryId=${countryId}`);
    return res.data ?? [];
  },

  async cities(stateId: string, q?: string): Promise<CityOption[]> {
    const qs = new URLSearchParams({ stateId });
    if (q) qs.set("q", q);
    const res = await apiClient.get<CityOption[]>(`/api/locations/cities?${qs.toString()}`);
    return res.data ?? [];
  },

  /** Free-text autocomplete — backed by Mapbox when configured, falls back
   *  to seed-table prefix match. */
  async search(q: string, country?: string): Promise<GeocodeHit[]> {
    const qs = new URLSearchParams({ q });
    if (country) qs.set("country", country);
    const res = await apiClient.get<GeocodeHit[]>(`/api/locations/search?${qs.toString()}`);
    return res.data ?? [];
  },

  /** "Use my current location" — reverse-geocode browser geolocation. */
  async reverse(lat: number, lng: number): Promise<GeocodeHit | null> {
    const res = await apiClient.get<GeocodeHit | null>(`/api/locations/reverse?lat=${lat}&lng=${lng}`);
    return res.data ?? null;
  },

  async getForEntity(
    kind: ContentLocationKind,
    entityId: string,
  ): Promise<ResolvedContentLocation[]> {
    const res = await apiClient.get<ResolvedContentLocation[]>(
      `/api/locations/entities/${kind}/${entityId}`,
    );
    return res.data ?? [];
  },

  async setForEntity(
    kind: ContentLocationKind,
    entityId: string,
    set: ContentLocationSet,
  ): Promise<ResolvedContentLocation[]> {
    const res = await apiClient.post<ResolvedContentLocation[]>(
      `/api/locations/entities/${kind}/${entityId}`,
      set,
    );
    return res.data ?? [];
  },
};
