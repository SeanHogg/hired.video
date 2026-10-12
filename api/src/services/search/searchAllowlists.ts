/**
 * Entity-id allowlists for the public unified search.
 *
 * Geo (content_locations via LocationService) and audience
 * (content_audiences via AudienceService) filters each translate into an
 * entity-id allowlist per ContentLocationKind. Semantics everywhere:
 *   - `null`      → no constraint
 *   - `[]`        → filter applied, nothing matched (short-circuit the query)
 *   - `[ids…]`    → intersect the kind's candidates with these ids
 */

import type { ContentLocationKind, LocationFilter } from "../../../../shared/content-locations.js";
import type { AudienceKey } from "../../../../shared/audiences.js";
import type { EntityAllowlist } from "../../repositories/publicSearchRepository.js";

/** Intersect two allowlists, preserving "null = no filter" semantics:
 *    - both null → null (no constraint)
 *    - one null  → return the other (single filter applied)
 *    - both set  → set intersection (empty array = short-circuit) */
export function intersectAllowlists(a: EntityAllowlist, b: EntityAllowlist): EntityAllowlist {
  if (a === null && b === null) return null;
  if (a === null) return b;
  if (b === null) return a;
  if (a.length === 0 || b.length === 0) return [];
  const setB = new Set(b);
  return a.filter((id) => setB.has(id));
}

/** True when an allowlist was applied but matched zero entities — the
 *  corresponding query is skipped. */
export function allowEmpty(allow: EntityAllowlist): boolean {
  return allow !== null && allow.length === 0;
}

/** The slice of LocationService / AudienceService the resolver needs. */
export interface AllowlistSources {
  applyLocationFilter(kind: ContentLocationKind, filter: LocationFilter): Promise<string[] | null>;
  applyAudienceFilter(kind: ContentLocationKind, audienceKey: AudienceKey | null): Promise<string[] | null>;
}

export interface AllowlistFilters {
  geoFilter: LocationFilter;
  hasStructuredGeo: boolean;
  audienceKey: AudienceKey | null;
}

/** Resolve the allowlist for one entity kind. Layers geo + audience
 *  (each independent); returns null when neither filter is set OR the kind
 *  is excluded by category. */
export async function resolveAllowlist(
  sources: AllowlistSources,
  filters: AllowlistFilters,
  kind: ContentLocationKind,
  enabled: boolean,
): Promise<EntityAllowlist> {
  if (!enabled) return null;
  const [geoAllow, audienceAllow] = await Promise.all([
    filters.hasStructuredGeo
      ? sources.applyLocationFilter(kind, filters.geoFilter)
      : Promise.resolve(null),
    sources.applyAudienceFilter(kind, filters.audienceKey),
  ]);
  return intersectAllowlists(geoAllow, audienceAllow);
}
