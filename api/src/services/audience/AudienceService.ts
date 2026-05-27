/**
 * AudienceService — thin business-logic layer over
 * ContentAudiencesRepository. Validates audience keys against the shared
 * enum, derives the taxonomy when callers don't supply it, and exposes
 * the entity-id allowlist that search routes use to narrow results.
 *
 * The same SSoT pattern as LocationService:
 *   - applyAudienceFilter(kind, audienceKey)   → entity-id allowlist or null
 *   - saveAudiences(kind, entityId, inputs)    → idempotent set write
 *   - resolveForEntity(kind, entityId)         → display payload
 *
 * Keep this in lockstep with shared/audiences.ts — every audience-aware
 * read or write goes through here so the taxonomy never desyncs.
 */

import { ContentAudiencesRepository } from "../../repositories/contentAudiencesRepository.js";
import type { SaveAudienceInput } from "../../repositories/contentAudiencesRepository.js";
import type {
  ContentAudienceKind,
  ContentAudienceInput,
  ResolvedContentAudience,
} from "../../../../shared/content-audiences.js";
import {
  AudienceKeySchema,
  taxonomyOf,
  type AudienceKey,
} from "../../../../shared/audiences.js";

export interface AudienceServiceDeps {
  db: any;
}

export class AudienceService {
  private readonly repo: ContentAudiencesRepository;

  constructor(deps: AudienceServiceDeps) {
    this.repo = new ContentAudiencesRepository(deps.db);
  }

  /** Validate + canonicalize a single audience input. Throws on unknown
   *  keys so write paths fail fast rather than persisting a tag the read
   *  path can't classify. Returns the canonical form (taxonomy filled
   *  in). */
  static canonicalize(input: ContentAudienceInput): SaveAudienceInput {
    const key = AudienceKeySchema.parse(input.audienceKey);
    const derivedTaxonomy = taxonomyOf(key);
    if (!derivedTaxonomy) {
      // Defense in depth — AudienceKeySchema should have rejected.
      throw new Error(`Unknown audience key: ${key}`);
    }
    const supplied = input.audienceTaxonomy;
    if (supplied && supplied !== derivedTaxonomy) {
      throw new Error(
        `Audience key '${key}' belongs to taxonomy '${derivedTaxonomy}', not '${supplied}'`,
      );
    }
    return { audienceKey: key, audienceTaxonomy: derivedTaxonomy };
  }

  /** Replace the audience-tag set for an entity. Empty array clears all
   *  tags. Idempotent. */
  async saveAudiences(
    entityKind: ContentAudienceKind,
    entityId: string,
    inputs: ContentAudienceInput[],
  ): Promise<void> {
    const canonical = inputs.map(AudienceService.canonicalize);
    await this.repo.replaceForEntity(entityKind, entityId, canonical);
  }

  async resolveForEntity(
    entityKind: ContentAudienceKind,
    entityId: string,
  ): Promise<ResolvedContentAudience[]> {
    return this.repo.findForEntity(entityKind, entityId);
  }

  /** Search route helper — turns a single audience filter into an
   *  entity-id allowlist. Returns null when no filter was set ("don't
   *  intersect"); returns [] when the filter matched zero entities
   *  ("short-circuit the query"). Mirrors LocationService.applyLocationFilter. */
  async applyAudienceFilter(
    entityKind: ContentAudienceKind,
    audienceKey: AudienceKey | null | undefined,
  ): Promise<string[] | null> {
    if (!audienceKey) return null;
    // Defensive validation — drop silently if route param wasn't already
    // narrowed to the enum, so a bogus query string can't widen results.
    const parsed = AudienceKeySchema.safeParse(audienceKey);
    if (!parsed.success) return [];
    return this.repo.matchingEntityIds(entityKind, parsed.data);
  }
}
