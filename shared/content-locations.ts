/**
 * Single source of truth for the polymorphic content_locations
 * discriminator + role enums, plus the input shape every form on the
 * frontend submits and every search route on the backend filters by.
 *
 * Both backend (api/src/services/location/*, api/src/routes/locations.ts)
 * and frontend (LocationPicker, LocationFilter) import from here so the
 * enum surface can't drift across the wire.
 *
 * See migration 0108_content_locations.sql for storage layout.
 */
import { z } from "zod";

import { UuidLikeSchema } from "./validation.js";
/**
 * Every content type that supports geo targeting. Adding a new kind here
 * is the ONLY place required to onboard a new entity — search wiring is
 * generic over kind.
 */
export const CONTENT_LOCATION_KINDS = [
  "job",
  "resume",
  "video",
  "service",
  "article",
  "voice",
  "template",
  "talent_pool_candidate",
  "user_profile",
  "company",
  "event",
] as const;
export type ContentLocationKind = (typeof CONTENT_LOCATION_KINDS)[number];

export const CONTENT_LOCATION_ROLES = ["origin", "serves"] as const;
export type ContentLocationRole = (typeof CONTENT_LOCATION_ROLES)[number];

/**
 * Input from a form: one geo tag. All FK ids optional so the creator
 * can pick whatever granularity is meaningful (country-only national
 * post, full triple for a local plumbing service).
 *
 * `isRemote` is orthogonal to geo: a job can be Remote AND target
 * "US viewers only" — meaning location-unbounded delivery with
 * geographic content relevance.
 */
export const ContentLocationInputSchema = z.object({
  role: z.enum(CONTENT_LOCATION_ROLES).default("origin"),
  countryId: z.number().int().positive().nullable().optional(),
  stateId: UuidLikeSchema.nullable().optional(),
  cityId: UuidLikeSchema.nullable().optional(),
  postalCode: z.string().max(20).nullable().optional(),
  latitude: z.number().gte(-90).lte(90).nullable().optional(),
  longitude: z.number().gte(-180).lte(180).nullable().optional(),
  radiusKm: z.number().int().positive().max(20000).nullable().optional(),
  label: z.string().max(255).nullable().optional(),
  isRemote: z.boolean().default(false),
});
export type ContentLocationInput = z.infer<typeof ContentLocationInputSchema>;

/**
 * Payload a content form sends on create/edit: exactly one optional
 * origin + 0..N serves regions. Form components serialize their state
 * into this shape and the backend writes one DB row per element.
 *
 * Everything is `.partial()` because picker state is built up field-by-
 * field as the user makes selections — `isRemote` doesn't get a value
 * until the toggle is touched, `role` is filled in by LocationService.
 * Defaults (isRemote=false, role='origin') are applied at write time in
 * LocationService.toSaveInput + ContentLocationsRepository.toInsertRow.
 */
export const ContentLocationSetSchema = z.object({
  origin: ContentLocationInputSchema.partial().nullable().optional(),
  serves: z.array(ContentLocationInputSchema.partial()).default([]),
});
export type ContentLocationSet = z.infer<typeof ContentLocationSetSchema>;

/**
 * Search filter — viewer-side. A search query carries ONE of these.
 * The backend matches it against the entity's origin AND any serves
 * row, with state/country fallback when the viewer-picked city isn't
 * targeted (a job in "Bellevue, WA" still matches a Seattle viewer
 * because both share state=WA).
 *
 * `remote` is tri-state on purpose:
 *   - undefined → "I don't care, include remote and local"
 *   - true       → "remote-only" (entity must have a serves/origin
 *                  with is_remote=true)
 *   - false      → "exclude remote" (entity must NOT be is_remote)
 */
export const LocationFilterSchema = z.object({
  countryId: z.number().int().positive().nullable().optional(),
  stateId: UuidLikeSchema.nullable().optional(),
  cityId: UuidLikeSchema.nullable().optional(),
  latitude: z.number().gte(-90).lte(90).nullable().optional(),
  longitude: z.number().gte(-180).lte(180).nullable().optional(),
  radiusKm: z.number().int().positive().max(20000).nullable().optional(),
  remote: z.boolean().optional(),
  /**
   * Legacy free-text fallback for callers that haven't migrated their
   * UI to the picker yet. When set and no structured ids are provided,
   * the backend geocodes this string via Mapbox (if token present)
   * and falls back to ilike() across the entity's free-text column.
   */
  text: z.string().max(200).optional(),
});
export type LocationFilter = z.infer<typeof LocationFilterSchema>;

/**
 * Resolved location returned to the frontend for display — joins the
 * reference tables so cards can render "Seattle, WA, US" without
 * three additional round-trips.
 */
export interface ResolvedContentLocation {
  id: string;
  entityKind: ContentLocationKind;
  entityId: string;
  role: ContentLocationRole;
  countryId: number | null;
  countryName: string | null;
  countryIso2: string | null;
  stateId: string | null;
  stateName: string | null;
  stateCode: string | null;
  cityId: string | null;
  cityName: string | null;
  postalCode: string | null;
  latitude: number | null;
  longitude: number | null;
  radiusKm: number | null;
  label: string | null;
  isRemote: boolean;
}

/**
 * Format a resolved location for one-line card display.
 *   "Seattle, WA, US"
 *   "Remote — US"
 *   "California, US"
 */
export function formatLocation(loc: ResolvedContentLocation | null | undefined): string {
  if (!loc) return "";
  if (loc.label) return loc.label;
  const parts: string[] = [];
  if (loc.cityName) parts.push(loc.cityName);
  if (loc.stateCode) parts.push(loc.stateCode);
  else if (loc.stateName) parts.push(loc.stateName);
  if (loc.countryIso2) parts.push(loc.countryIso2);
  const base = parts.join(", ");
  if (loc.isRemote) return base ? `Remote — ${base}` : "Remote";
  return base;
}

/**
 * Bbox math for radius prefilters. Returns lat/lng bounds wide enough
 * to contain every point within `radiusKm` of the center. Caller still
 * does a haversine distance check on candidates to filter the bbox
 * corners that fall outside the actual circle. Pure utility — no DB.
 */
export function radiusBoundingBox(
  latitude: number,
  longitude: number,
  radiusKm: number,
): { minLat: number; maxLat: number; minLng: number; maxLng: number } {
  const latDelta = radiusKm / 111;
  const cosLat = Math.cos((latitude * Math.PI) / 180);
  const lngDelta = radiusKm / (111 * Math.max(0.001, Math.abs(cosLat)));
  return {
    minLat: Math.max(-90, latitude - latDelta),
    maxLat: Math.min(90, latitude + latDelta),
    minLng: Math.max(-180, longitude - lngDelta),
    maxLng: Math.min(180, longitude + lngDelta),
  };
}

/**
 * Haversine great-circle distance in km. Used to filter bbox candidates
 * to the actual circle after the cheap lat/lng range query.
 */
export function haversineKm(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}
