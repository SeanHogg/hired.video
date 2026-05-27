/**
 * Wire-level schema for the polymorphic content_audiences table — mirrors
 * the shape of content-locations.ts so both axes have the same call
 * conventions on the frontend (LocationPicker ↔ AudiencePicker) and the
 * backend (LocationFilter ↔ AudienceFilter).
 *
 * See:
 *   - shared/audiences.ts              for the taxonomy + key enums
 *   - api/drizzle/0149_audience_geo_demographics.sql for storage layout
 *   - api/src/db/schema/contentAudiences.ts          for the Drizzle table
 *
 * The `entityKind` field reuses CONTENT_LOCATION_KINDS from
 * content-locations.ts on purpose — every geo-taggable kind is also
 * audience-taggable, no extra surface needed.
 */
import { z } from "zod";
import { CONTENT_LOCATION_KINDS } from "./content-locations.js";
import {
  AudienceKeySchema,
  AudienceTaxonomySchema,
  type AudienceKey,
  type AudienceTaxonomy,
} from "./audiences.js";

/** Same kinds the geo system tags — kept as one set so a new entity kind
 *  doesn't have to be added in two places. */
export const CONTENT_AUDIENCE_KINDS = CONTENT_LOCATION_KINDS;
export type ContentAudienceKind = (typeof CONTENT_AUDIENCE_KINDS)[number];

/** One audience tag a creator submits with a piece of content. Multiple
 *  tags allowed per entity; idempotent (DB unique on the triple). The
 *  `audienceTaxonomy` is optional on the wire because the taxonomy is
 *  derivable from the key (see taxonomyOf in audiences.ts) — providing it
 *  lets a caller assert the axis explicitly but isn't required. */
export const ContentAudienceInputSchema = z.object({
  audienceKey: AudienceKeySchema,
  audienceTaxonomy: AudienceTaxonomySchema.optional(),
});
export type ContentAudienceInput = z.infer<typeof ContentAudienceInputSchema>;

/** Payload a content form sends on create/edit: 0..N audience tags. The
 *  backend writes one DB row per element; pre-existing rows that aren't
 *  in the new set get deleted (set semantics, not append). */
export const ContentAudienceSetSchema = z.object({
  audiences: z.array(ContentAudienceInputSchema).default([]),
});
export type ContentAudienceSet = z.infer<typeof ContentAudienceSetSchema>;

/** Search filter — viewer-side. A search query carries one audience key
 *  (the /for/[audience] route param translated). Backend filters the
 *  candidate entity_id list down to those tagged with this key. */
export const AudienceFilterSchema = z.object({
  audienceKey: AudienceKeySchema.optional(),
});
export type AudienceFilter = z.infer<typeof AudienceFilterSchema>;

/** Resolved tag returned to the frontend for display. */
export interface ResolvedContentAudience {
  id: string;
  entityKind: ContentAudienceKind;
  entityId: string;
  audienceKey: AudienceKey;
  audienceTaxonomy: AudienceTaxonomy;
}
