/**
 * ContentAudiencesRepository — pure data access for the polymorphic
 * content_audiences table (migration 0166).
 *
 * Mirrors the shape of ContentLocationsRepository so the call surface is
 * predictable: replaceForEntity / findForEntity / matchingEntityIds. No
 * business logic; key validation + taxonomy derivation live on
 * AudienceService.
 */

import { and, eq, inArray, sql } from "drizzle-orm";
import { schema } from "../db/index.js";
import type {
  ContentAudienceKind,
  ResolvedContentAudience,
} from "../../../shared/content-audiences.js";
import type {
  AudienceKey,
  AudienceTaxonomy,
} from "../../../shared/audiences.js";

const { contentAudiences } = schema;

export type DbLike = any;

export type ContentAudienceRow = typeof contentAudiences.$inferSelect;
export type ContentAudienceInsert = typeof contentAudiences.$inferInsert;

export interface SaveAudienceInput {
  audienceKey: AudienceKey;
  audienceTaxonomy: AudienceTaxonomy;
}

export interface IContentAudiencesRepository {
  /** Replace the full audience-tag set for an entity. Tags not in `next`
   *  get deleted; new tags get inserted; existing tags pass through. */
  replaceForEntity(
    entityKind: ContentAudienceKind,
    entityId: string,
    next: SaveAudienceInput[],
  ): Promise<void>;

  /** Get all audience tags on one entity. */
  findForEntity(
    entityKind: ContentAudienceKind,
    entityId: string,
  ): Promise<ResolvedContentAudience[]>;

  /** Find the set of entity_ids of `entityKind` tagged with `audienceKey`.
   *  Used by search routes to narrow results before joining the entity
   *  table. Returns null when no audience filter is set (signal: "no
   *  filter — don't intersect"); returns [] when the filter matched
   *  nothing (signal: "filter set but empty — short-circuit the query"). */
  matchingEntityIds(
    entityKind: ContentAudienceKind,
    audienceKey: AudienceKey | null | undefined,
  ): Promise<string[] | null>;
}

export class ContentAudiencesRepository implements IContentAudiencesRepository {
  constructor(
    private readonly db: DbLike,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async replaceForEntity(
    entityKind: ContentAudienceKind,
    entityId: string,
    next: SaveAudienceInput[],
  ): Promise<void> {
    const desiredKeys = new Set(next.map((n) => n.audienceKey));

    const existing: ContentAudienceRow[] = await this.db
      .select()
      .from(contentAudiences)
      .where(
        and(
          eq(contentAudiences.entityKind, entityKind),
          eq(contentAudiences.entityId, entityId),
        ),
      );
    const existingKeys = new Set(existing.map((r) => r.audienceKey));

    const toDelete = existing.filter((r) => !desiredKeys.has(r.audienceKey as AudienceKey));
    const toInsert = next.filter((n) => !existingKeys.has(n.audienceKey));

    if (toDelete.length > 0) {
      await this.db
        .delete(contentAudiences)
        .where(
          and(
            eq(contentAudiences.entityKind, entityKind),
            eq(contentAudiences.entityId, entityId),
            inArray(
              contentAudiences.audienceKey,
              toDelete.map((r) => r.audienceKey),
            ),
          ),
        );
    }

    if (toInsert.length > 0) {
      const ts = this.now();
      const rows: ContentAudienceInsert[] = toInsert.map((n) => ({
        entityKind,
        entityId,
        audienceKey: n.audienceKey,
        audienceTaxonomy: n.audienceTaxonomy,
        createdAt: ts,
        updatedAt: ts,
      }));
      // ON CONFLICT DO NOTHING — the unique index makes re-tagging
      // idempotent across concurrent writers.
      await this.db
        .insert(contentAudiences)
        .values(rows)
        .onConflictDoNothing({
          target: [
            contentAudiences.entityKind,
            contentAudiences.entityId,
            contentAudiences.audienceKey,
          ],
        });
    }
  }

  async findForEntity(
    entityKind: ContentAudienceKind,
    entityId: string,
  ): Promise<ResolvedContentAudience[]> {
    const rows: ContentAudienceRow[] = await this.db
      .select()
      .from(contentAudiences)
      .where(
        and(
          eq(contentAudiences.entityKind, entityKind),
          eq(contentAudiences.entityId, entityId),
        ),
      );
    return rows.map((r) => ({
      id: r.id,
      entityKind: r.entityKind as ContentAudienceKind,
      entityId: r.entityId,
      audienceKey: r.audienceKey as AudienceKey,
      audienceTaxonomy: r.audienceTaxonomy as AudienceTaxonomy,
    }));
  }

  async matchingEntityIds(
    entityKind: ContentAudienceKind,
    audienceKey: AudienceKey | null | undefined,
  ): Promise<string[] | null> {
    if (!audienceKey) return null;
    const rows: { entityId: string }[] = await this.db
      .select({ entityId: contentAudiences.entityId })
      .from(contentAudiences)
      .where(
        and(
          eq(contentAudiences.entityKind, entityKind),
          eq(contentAudiences.audienceKey, audienceKey),
        ),
      );
    return rows.map((r) => r.entityId);
  }
}
